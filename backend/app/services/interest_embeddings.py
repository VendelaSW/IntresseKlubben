"""
Embeddings för intressena: en vektor per intresse som säger vad det betyder, så att intressen som betyder ungefär
samma sak (Bouldering och Klättring, "Tomater" och Odling) kan hittas utan att jämföra ord.

Vektorerna ligger i en egen tabell (models/interest_embedding.py), så att de inte följer med när intressen läses.

- embedding_text: texten som räknas. Intressets eget namn, beskrivning och alias, men inte föräldrarnas namn
  ("Löpning", inte "Sport och träning > Löpning"), eftersom likheten då blir mer ren. Huvudområdena har sina egna vektorer.
- text_hash: modell, storlek och text. Ändras något av det räknas vektorn om, och byter vi embeddingsmodell
  räknas alla om.
- fill_embeddings: räknar vektorerna som saknas eller har ändrats (`python -m app.sync_embeddings`). Letandet
  jämför bara hashar och läser aldrig några vektorer.
- embed_interests: vektorer för nya intressen, som aldrig får stoppa att de sparas.
- nearest_interests: de intressen som ligger närmast en vektor. I Postgres (Neon) görs det i databasen med
  pgvector, och bara intressena och avstånden lämnar den. I testerna (SQLite) räknar Python.
"""

import hashlib
import math

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.interest import Interest, InterestStatus
from app.models.interest_embedding import EMBEDDING_DIMENSIONS, InterestEmbedding
from app.services.ai_clients import EMBEDDING_MODEL, AIFailed, AINotConfigured, Deadline, Embedder, get_embedder


def embedding_text(interest: Interest) -> str:
    """Texten som blir en vektor: namn, beskrivning och alias, men inte föräldrarnas namn."""
    parts = [interest.name]
    if interest.description:
        parts.append(interest.description.rstrip("."))
    aliases = [alias.strip() for alias in (interest.aliases or "").split("\n") if alias.strip()]
    if aliases:
        parts.append("Även kallat: " + ", ".join(aliases))
    return ". ".join(parts)


def text_hash(text: str) -> str:
    """Vilken modell, storlek och text en vektor räknades på."""
    return hashlib.sha256(f"{EMBEDDING_MODEL}|{EMBEDDING_DIMENSIONS}|{text}".encode("utf-8")).hexdigest()[:16]


def interests_to_embed(db: Session) -> list[tuple[Interest, str]]:
    """Intressena som saknar vektor eller vars text, modell eller storlek har ändrats, med texten som ska räknas.
    Bara hasharna läses, aldrig vektorerna."""
    rows = (
        db.query(Interest, InterestEmbedding.embedding_hash)
        .outerjoin(InterestEmbedding, InterestEmbedding.interest_id == Interest.id)
        .filter(Interest.status != InterestStatus.inactive.value)
        .order_by(Interest.id)
        .all()
    )
    todo = []
    for interest, stored_hash in rows:
        text = embedding_text(interest)
        if stored_hash != text_hash(text):
            todo.append((interest, text))
    return todo


def count_missing(db: Session) -> int:
    return len(interests_to_embed(db))


def _save(db: Session, items: list[tuple[Interest, str, list[float]]]) -> None:
    """Sparar vektorerna: en ny rad för ett intresse som saknar, annars uppdateras raden."""
    existing = {
        row.interest_id: row
        for row in db.query(InterestEmbedding).filter(InterestEmbedding.interest_id.in_([i.id for i, _, _ in items]))
    }
    for interest, text, vector in items:
        row = existing.get(interest.id)
        if row is None:
            db.add(InterestEmbedding(interest_id=interest.id, embedding=vector, embedding_hash=text_hash(text)))
        else:
            row.embedding, row.embedding_hash, row.updated_at = vector, text_hash(text), func.now()


def fill_embeddings(db: Session, embedder: Embedder | None = None, deadline: Deadline | None = None) -> int:
    """Räknar och sparar vektorerna som saknas eller har ändrats, och ger antalet. Kastar AINotConfigured eller
    AIFailed om det inte går, och då sparas ingenting."""
    todo = interests_to_embed(db)
    if not todo:
        return 0
    vectors = (embedder or get_embedder()).embed([text for _, text in todo], deadline)
    _save(db, [(interest, text, vector) for (interest, text), vector in zip(todo, vectors)])
    db.commit()
    return len(todo)


def fill_embeddings_report(db: Session, embedder: Embedder | None = None) -> tuple[bool, str]:
    """Som fill_embeddings, men kastar inget: ger om det gick och en rad text om vad som hände. Används av
    skripten (`python -m app.sync_embeddings` och slutet av `python -m app.sync_interests`)."""
    try:
        done = fill_embeddings(db, embedder)
    except AINotConfigured:
        return False, "OPENAI_API_KEY saknas, så inga vektorer räknades. Kör python -m app.sync_embeddings när nyckeln finns."
    except AIFailed as err:
        return False, f"Anropet till OpenAI misslyckades ({err}), så inga vektorer sparades. Kör python -m app.sync_embeddings igen."
    return True, f"{done} intressen fick en vektor." if done else "Alla intressen har redan en aktuell vektor."


EMBED_NEW_SECONDS = 5  # längre får ett nytt intresse inte vänta på sin vektor: sparandet är viktigare än vektorn


def embed_interests(db: Session, interests: list[Interest], embedder: Embedder | None = None) -> bool:
    """Räknar vektorerna för nyskapade intressen i ett enda anrop (intressena måste vara sparade, så att de har id). Går det
    inte (ingen nyckel, OpenAI nere, för långsamt) sparas intressena ändå utan vektor, och nästa
    `python -m app.sync_embeddings` fyller i dem. Ger om det lyckades."""
    if not interests:
        return True
    texts = [embedding_text(interest) for interest in interests]
    try:
        vectors = (embedder or get_embedder()).embed(texts, Deadline(EMBED_NEW_SECONDS))
    except (AIFailed, AINotConfigured):
        return False
    _save(db, list(zip(interests, texts, vectors)))
    db.flush()
    return True


def embed_interest(db: Session, interest: Interest, embedder: Embedder | None = None) -> bool:
    """Som embed_interests, för ett enda intresse."""
    return embed_interests(db, [interest], embedder)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def _candidates(db: Session, statuses: tuple[str, ...], exclude_ids: set[int] | None):
    query = db.query(Interest).join(InterestEmbedding, InterestEmbedding.interest_id == Interest.id).filter(Interest.status.in_(statuses))
    return query.filter(Interest.id.notin_(exclude_ids)) if exclude_ids else query


def nearest_in_postgres(db: Session, vector: list[float], limit: int, statuses: tuple[str, ...], exclude_ids: set[int] | None):
    """Frågan som ger de närmaste intressena i Postgres: avståndet räknas av pgvector i databasen, och bara intressena och
    avstånden kommer tillbaka, aldrig vektorerna."""
    distance = InterestEmbedding.embedding.cosine_distance(vector)
    return _candidates(db, statuses, exclude_ids).add_columns(distance.label("distance")).order_by(distance).limit(limit)


def nearest_interests(
    db: Session,
    vector: list[float],
    limit: int = 10,
    statuses: tuple[str, ...] = (InterestStatus.active.value,),
    exclude_ids: set[int] | None = None,
) -> list[tuple[Interest, float]]:
    """De `limit` intressen som ligger närmast `vector`, med likheten (1 = samma betydelse), närmast först. Bara intressen
    som har en vektor och har någon av `statuses` tas med."""
    if db.get_bind().dialect.name == "postgresql":
        return [(interest, 1.0 - float(d)) for interest, d in nearest_in_postgres(db, vector, limit, statuses, exclude_ids).all()]
    interests = {interest.id: interest for interest in _candidates(db, statuses, exclude_ids).all()}
    stored = db.query(InterestEmbedding.interest_id, InterestEmbedding.embedding).filter(InterestEmbedding.interest_id.in_(list(interests))).all()
    scored = [(interests[interest_id], _cosine_similarity(vector, embedding)) for interest_id, embedding in stored]
    return sorted(scored, key=lambda pair: -pair[1])[:limit]
