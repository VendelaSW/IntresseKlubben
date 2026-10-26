"""
Vektorn för Om mig-texten (models/profile_embedding.py): en betydelsevektor per profil, så att matchningen senare kan
jämföra vad personer skriver om sig själva. Det här bygger bara vektorn. Inget i appen använder den än, och en profil
som saknar den fungerar som vanligt.

Reglerna:
- Texten skickas till embeddingsmodellen SAMTIDIGT som den kontrolleras (ordfilter, moderation, policy), så att den
  extra tiden döljs bakom kontrollen i stället för att läggas efter den (start_embedding körs i en tråd). Nekas texten
  sparas den inte, och då sparas inte heller någon vektor.
- Vektorn sparas först när profilen är sparad (store_profile_embedding). Ändras texten tas den gamla vektorn bort och en
  ny skapas för den nya texten. Ändras inte texten görs inget, och inget anrop väntas på.
- Ett embedding-anrop som misslyckas (ingen nyckel, OpenAI nere, för långsamt) stoppar aldrig sparandet av en profil.
  Profilen sparas då utan vektor (en gammal vektor hör till en text som inte längre finns, så den tas bort), och
  `python -m app.sync_embeddings` fyller i den senare. Saknas tabellen (koden är utrullad före migrationen) blir det
  likadant: ingen vektor, inget fel.
- Bara profile_text embeddas, aldrig namn, stadsdel eller intressen.
"""

import logging
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.profile_embedding import ProfileEmbedding
from app.services.ai_clients import AIFailed, AINotConfigured, Deadline, Embedder, get_embedder
from app.services.interest_embeddings import text_hash

logger = logging.getLogger(__name__)

EMBED_PROFILE_SECONDS = 5  # längre får en profil inte vänta på sin vektor: sparandet är viktigare än vektorn
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="profile-embedding")


class PendingEmbedding:
    """En vektor som håller på att räknas för `text` (se start_embedding)."""

    def __init__(self, text: str, future: Future | None):
        self.text = text
        self._future = future

    def wait(self, text: str) -> list[float] | None:
        """Vektorn, eller None om den inte gick att räkna eller räknades för en annan text än `text`."""
        if self._future is None or text != self.text:
            return None
        try:
            return self._future.result(timeout=EMBED_PROFILE_SECONDS + 1)
        except FutureTimeout:
            return None
        except Exception:  # en trasig embedder får aldrig stoppa sparandet
            logger.warning("Vektorn för Om mig-texten kunde inte räknas", exc_info=True)
            return None


def _embed(embedder: Embedder, text: str) -> list[float] | None:
    try:
        return embedder.embed([text], Deadline(EMBED_PROFILE_SECONDS))[0]
    except (AIFailed, AINotConfigured):
        return None


def start_embedding(text: str, embedder: Embedder | None = None) -> PendingEmbedding:
    """Börjar räkna vektorn för Om mig-texten i en tråd och ger direkt tillbaka. Anropa den innan texten kontrolleras, så att
    de två går samtidigt, och lämna resultatet till store_profile_embedding när profilen är sparad."""
    text = text.strip()
    try:
        embedder = embedder or get_embedder()
    except AINotConfigured:
        return PendingEmbedding(text, None)
    return PendingEmbedding(text, _executor.submit(_embed, embedder, text))


def start_embedding_if_needed(db: Session, profile: Profile | None, text: str, embedder: Embedder | None = None) -> PendingEmbedding | None:
    """Som start_embedding, men bara när en ny vektor behövs: profilen saknas än (en ny profil), texten har ändrats, eller
    vektorn saknas (ett tidigare anrop misslyckades). Annars None, och inget anrop görs."""
    text = text.strip()
    if profile is not None:
        try:
            row = db.get(ProfileEmbedding, profile.id)
        except SQLAlchemyError:
            db.rollback()  # tabellen finns inte än: ingen vektor, och sparandet ska gå som vanligt
            return None
        if row is not None and row.embedding_hash == text_hash(text):
            return None
    return start_embedding(text, embedder)


def store_profile_embedding(db: Session, profile: Profile, pending: PendingEmbedding | None) -> bool:
    """Sparar vektorn för profilens nuvarande Om mig-text, och tar bort den gamla. Ger om det finns en aktuell vektor efteråt.
    Kastar aldrig: profilen är redan sparad, och vektorn är bara ett tillägg."""
    text = (profile.profile_text or "").strip()
    wanted = text_hash(text)
    try:
        row = db.get(ProfileEmbedding, profile.id)
        if row is not None and row.embedding_hash == wanted:
            return True  # samma text som förut: vektorn gäller fortfarande
        vector = pending.wait(text) if pending is not None and text else None
        if row is not None:
            db.delete(row)  # den gamla hör till en text som inte längre finns
            db.flush()
        if vector is None:
            db.commit()
            return False
        db.add(ProfileEmbedding(profile_id=profile.id, embedding=vector, embedding_hash=wanted))
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()  # i Postgres måste transaktionen rullas tillbaka innan sessionen går att använda igen
        logger.warning("Vektorn för Om mig-texten kunde inte sparas", exc_info=True)
        return False


def profiles_to_embed(db: Session) -> list[tuple[int, str]]:
    """Profilerna vars Om mig-text saknar en aktuell vektor, som (profil-id, text)."""
    hashes = dict(db.query(ProfileEmbedding.profile_id, ProfileEmbedding.embedding_hash).all())
    todo = []
    for profile_id, text in db.query(Profile.id, Profile.profile_text).order_by(Profile.id):
        text = (text or "").strip()
        if text and hashes.get(profile_id) != text_hash(text):
            todo.append((profile_id, text))
    return todo


def count_missing_profiles(db: Session) -> int:
    return len(profiles_to_embed(db))


def fill_profile_embeddings(db: Session, embedder: Embedder | None = None, deadline: Deadline | None = None) -> int:
    """Räknar och sparar vektorerna som saknas eller hör till en gammal text, och ger antalet. Kastar AINotConfigured eller
    AIFailed om det inte går, och då sparas ingenting."""
    todo = profiles_to_embed(db)
    if not todo:
        return 0
    vectors = (embedder or get_embedder()).embed([text for _, text in todo], deadline)
    existing = {row.profile_id: row for row in db.query(ProfileEmbedding).filter(ProfileEmbedding.profile_id.in_([i for i, _ in todo]))}
    for (profile_id, text), vector in zip(todo, vectors):
        row = existing.get(profile_id)
        if row is not None:
            db.delete(row)
    db.flush()
    for (profile_id, text), vector in zip(todo, vectors):
        db.add(ProfileEmbedding(profile_id=profile_id, embedding=vector, embedding_hash=text_hash(text)))
    db.commit()
    return len(todo)


def fill_profile_embeddings_report(db: Session, embedder: Embedder | None = None) -> tuple[bool, str]:
    """Som fill_profile_embeddings, men kastar inget: ger om det gick och en rad text om vad som hände. Används av
    `python -m app.sync_embeddings`."""
    try:
        done = fill_profile_embeddings(db, embedder)
    except AINotConfigured:
        return False, "OPENAI_API_KEY saknas, så inga profilvektorer räknades."
    except AIFailed as err:
        return False, f"Anropet till OpenAI misslyckades ({err}), så inga profilvektorer sparades."
    return True, f"{done} profiler fick en vektor." if done else "Alla profiler har redan en aktuell vektor."
