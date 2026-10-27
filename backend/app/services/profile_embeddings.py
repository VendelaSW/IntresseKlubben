"""
Vektorn för Om mig-texten (models/profile_embedding.py): en betydelsevektor per profil, så att matchningen senare kan
jämföra vad personer skriver om sig själva. Det här bygger bara vektorn. Inget i appen använder den än, och en profil
som saknar den fungerar som vanligt.

Reglerna:
- Texten skickas till embeddingsmodellen SAMTIDIGT som AI-kontrollen körs (moderation och policy), så att den extra
  tiden döljs bakom kontrollen i stället för att läggas efter den (EmbeddingJob.start körs i en tråd). Det sker först
  när det lokala ordfiltret och spärren för antal kontroller har sagt ja, så att nekade och spärrade anrop inte kostar något.
  Är texten redan godkänd (förhandskontrollen) körs ingen AI-kontroll, och då räknas vektorn när profilen sparas.
  Nekas texten sparas den inte, och då sparas inte heller någon vektor.
- Vektorn sparas först när profilen är sparad (store_profile_embedding). Ändras texten tas den gamla vektorn bort i samma
  transaktion som textändringen (crud/profile.py), och en ny läggs till efteråt. Ändras inte texten görs inget.
- Matchningen ska hämta vektorn med profile_vector, som bara ger den om den hör till profilens nuvarande text. Två
  samtidiga sparningar kan i sällsynta fall lämna en vektor för den äldre texten, och den läker sig vid nästa sparning
  och med `python -m app.sync_embeddings`.
- Ett embedding-anrop som misslyckas (ingen nyckel, OpenAI nere, för långsamt) stoppar aldrig sparandet av en profil.
  Profilen sparas då utan vektor (en gammal vektor hör till en text som inte längre finns, så den tas bort), och
  `python -m app.sync_embeddings` fyller i den senare. Saknas tabellen (koden är utrullad före migrationen) blir det
  likadant: ingen vektor, inget fel.
- Bara profile_text embeddas, aldrig namn, stadsdel eller intressen.
"""

import logging
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.profile_embedding import ProfileEmbedding
from app.services.ai_clients import AIFailed, AINotConfigured, Deadline, Embedder, get_embedder
from app.services.interest_embeddings import text_hash

logger = logging.getLogger(__name__)

EMBED_PROFILE_SECONDS = 3  # längre får en profil inte vänta på sin vektor: sparandet är viktigare än vektorn
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
    except (AIFailed, AINotConfigured) as err:
        logger.warning("Vektorn för Om mig-texten räknades inte (%s)", type(err).__name__)  # syns i loggen hur ofta det händer
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


def embedding_needed(db: Session, profile: Profile | None, text: str) -> bool:
    """Behövs en ny vektor? Ja när profilen finns och dess vektor saknas eller hör till en annan text. Nej när profilen saknas
    (ett anrop skulle bara slösas) eller när vektorn redan gäller."""
    if profile is None:
        return False
    try:
        row = db.get(ProfileEmbedding, profile.id)
    except SQLAlchemyError:
        db.rollback()  # tabellen finns inte än: ingen vektor, och sparandet ska gå som vanligt
        return False
    return row is None or row.embedding_hash != text_hash(text.strip())


class EmbeddingJob:
    """Vektorn för en Om mig-text som ska sparas, från start till slut. Skapas innan texten kontrolleras:

        job = EmbeddingJob(text)                         # EmbeddingJob(text, enabled=False) = ingen vektor behövs
        check(text, on_ai_check=job.start)               # start anropas precis innan AI-kontrollen, så att de går samtidigt
        ... profilen sparas ...
        job.finish(db, profile)                          # sparar vektorn, och kastar aldrig

    start gör inget om jobbet är avstängt eller redan har startat, och finish startar vektorn om ingen AI-kontroll har
    körts (en redan godkänd text)."""

    def __init__(self, text: str, enabled: bool = True, embedder: Embedder | None = None):
        self.text = text.strip()
        self.enabled = enabled
        self._embedder = embedder
        self.pending: PendingEmbedding | None = None

    def start(self) -> None:
        if self.enabled and self.pending is None:
            self.pending = start_embedding(self.text, self._embedder)

    def finish(self, db: Session, profile: Profile) -> bool:
        if not self.enabled:
            return False
        self.start()
        return store_profile_embedding(db, profile, self.pending)


def store_profile_embedding(db: Session, profile: Profile, pending: PendingEmbedding | None) -> bool:
    """Sparar vektorn för profilens nuvarande Om mig-text, och tar bort en gammal. Ger om det finns en aktuell vektor efteråt.
    Kastar aldrig: profilen är redan sparad, och vektorn är bara ett tillägg. Har en annan sparning hunnit sätta in sin rad
    samtidigt försöker den en gång till, så att den som kom sist vinner."""
    text = (profile.profile_text or "").strip()
    wanted = text_hash(text)
    vector = None
    waited = False
    for attempt in (1, 2):
        try:
            row = db.get(ProfileEmbedding, profile.id)
            if row is not None and row.embedding_hash == wanted:
                return True  # samma text som förut: vektorn gäller fortfarande
            if not waited:
                vector = pending.wait(text) if pending is not None and text else None
                waited = True
            if row is not None:
                db.delete(row)  # den gamla hör till en text som inte längre finns
                db.flush()
            if vector is None:
                db.commit()
                return False
            db.add(ProfileEmbedding(profile_id=profile.id, embedding=vector, embedding_hash=wanted))
            db.commit()
            return True
        except IntegrityError:
            db.rollback()  # en annan sparning hann före: försök en gång till
            if attempt == 2:
                logger.warning("Vektorn för Om mig-texten kunde inte sparas (samtidig sparning)")
        except SQLAlchemyError:
            db.rollback()  # i Postgres måste transaktionen rullas tillbaka innan sessionen går att använda igen
            logger.warning("Vektorn för Om mig-texten kunde inte sparas", exc_info=True)
            return False
    return False


def profile_vector(db: Session, profile: Profile) -> list[float] | None:
    """Vektorn för profilens nuvarande Om mig-text, eller None om den saknas eller hör till en annan text (två samtidiga
    sparningar kan i sällsynta fall lämna en gammal). Det här är sättet för matchningen att hämta den."""
    text = (profile.profile_text or "").strip()
    try:
        row = db.get(ProfileEmbedding, profile.id)
    except SQLAlchemyError:
        db.rollback()
        return None
    if row is None or not text or row.embedding_hash != text_hash(text):
        return None
    return list(row.embedding)


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
