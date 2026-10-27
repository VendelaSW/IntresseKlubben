"""
Förslagen: vilka personer som matchar den inloggade bäst (GET /matches), bäst först.

Formeln finns i services/matching.py och är ren. Det här är det som hämtar det den behöver:

- vilka som kan föreslås: alla med profil utom en själv, dem man tagit bort som förslag, blockerade (åt båda hållen), avstängda,
  kontakter och dem man har en obesvarad förfrågan med (åt båda hållen)
- likheterna mellan intressena och mellan Om mig-texterna. I Postgres (Neon) räknas de av pgvector i databasen, så att inga
  vektorer lämnar den och det tar några tiotals millisekunder för hundratals personer; i testerna (SQLite) räknar Python,
  med samma resultat. Själva poängen räknas alltid i Python (matching.combine), så att vikterna går att ändra utan SQL.

Den som själv inte har minst MIN_INTERESTS intressen och MIN_TEXT_CHARS tecken Om mig-text får inga förslag, bara besked om
vad som saknas. Samma krav gäller dem som föreslås. Förslag under MIN_SHOWN_PERCENT tas inte med.
"""

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.crud.contact import accepted_contact_ids, blocked_user_ids, pending_request_ids
from app.crud.dismissed_suggestion import list_dismissed_user_ids
from app.crud.interest_people import load_tree
from app.crud.moderation import suspended_user_ids
from app.crud.profile import get_profile
from app.models.interest_embedding import InterestEmbedding
from app.models.profile import Profile
from app.models.profile_embedding import ProfileEmbedding
from app.models.user_interest import UserInterest
from app.services.interest_embeddings import _cosine_similarity, text_hash
from app.services.matching import (
    DEFAULT_CONFIG,
    MIN_INTERESTS,
    MIN_SHOWN_PERCENT,
    MIN_TEXT_CHARS,
    Match,
    MatchConfig,
    Person,
    Readiness,
    combine,
    near_interests,
    readiness,
)
from app.services.profile_embeddings import profile_vector


@dataclass
class Suggestion:
    user_id: int
    match: Match


@dataclass
class SuggestionPage:
    readiness: Readiness
    suggestions: list[Suggestion] = field(default_factory=list)  # den här sidan, bäst först
    has_more: bool = False


def _is_postgres(db: Session) -> bool:
    return db.get_bind().dialect.name == "postgresql"


def hidden_user_ids(db: Session, user_id: int) -> set[int]:
    """Dem som aldrig ska föreslås för user_id."""
    return (
        list_dismissed_user_ids(db, user_id)
        | blocked_user_ids(db, user_id)
        | suspended_user_ids(db)
        | accepted_contact_ids(db, user_id)
        | pending_request_ids(db, user_id)
    )


def _interests_by_user(db: Session, user_ids: set[int]) -> dict[int, set[int]]:
    result: dict[int, set[int]] = {user_id: set() for user_id in user_ids}
    for user_id, interest_id in db.query(UserInterest.user_id, UserInterest.interest_id).filter(UserInterest.user_id.in_(user_ids)):
        result[user_id].add(interest_id)
    return result


def near_cosines(db: Session, mine: set[int], theirs: dict[int, set[int]]) -> dict[int, float]:
    """Råa närliggande-värdet (se matching.near_interests) mellan mina intressen och varje persons, per användar-id. Personer
    utan någon intressevektor saknas i svaret."""
    if not mine or not theirs:
        return {}
    if _is_postgres(db):
        return _near_in_postgres(db, mine, set(theirs))
    ids = set(mine).union(*theirs.values())
    vectors = {i: list(v) for i, v in db.query(InterestEmbedding.interest_id, InterestEmbedding.embedding).filter(InterestEmbedding.interest_id.in_(ids))}
    found = {user_id: near_interests(frozenset(mine), frozenset(interests), vectors) for user_id, interests in theirs.items()}
    return {user_id: value for user_id, value in found.items() if value is not None}


def _near_in_postgres(db: Session, mine: set[int], user_ids: set[int]) -> dict[int, float]:
    """Samma som near_interests, men räknat av pgvector: för varje intresse hos mig det närmaste hos personen, och för varje
    intresse hos personen det närmaste hos mig, och snittet av de två snitten. Intressen utan vektor finns inte med i
    något av dem, precis som i near_interests."""
    my_side, their_side = aliased(InterestEmbedding), aliased(InterestEmbedding)
    distance = my_side.embedding.cosine_distance(their_side.embedding)
    base = (
        select(my_side.interest_id.label("mine"), UserInterest.user_id.label("user"), UserInterest.interest_id.label("theirs"))
        .select_from(my_side)
        .join(UserInterest, UserInterest.user_id.in_(user_ids))
        .join(their_side, their_side.interest_id == UserInterest.interest_id)
        .where(my_side.interest_id.in_(mine))
    )
    closest_of_theirs = base.with_only_columns(my_side.interest_id, UserInterest.user_id, func.min(distance)).group_by(my_side.interest_id, UserInterest.user_id)
    closest_of_mine = base.with_only_columns(UserInterest.user_id, UserInterest.interest_id, func.min(distance)).group_by(UserInterest.user_id, UserInterest.interest_id)

    forward: dict[int, list[float]] = {}
    for _, user_id, d in db.execute(closest_of_theirs):
        forward.setdefault(user_id, []).append(1.0 - float(d))
    backward: dict[int, list[float]] = {}
    for user_id, _, d in db.execute(closest_of_mine):
        backward.setdefault(user_id, []).append(1.0 - float(d))

    result = {}
    for user_id in forward.keys() | backward.keys():
        sides = [sum(values) / len(values) for values in (forward.get(user_id), backward.get(user_id)) if values]
        result[user_id] = sum(sides) / len(sides)
    return result


def text_cosines(db: Session, my_vector: list[float], profiles: dict[int, str]) -> dict[int, float]:
    """Råa textlikheten mellan min Om mig-vektor och varje profils, per profil-id (`profiles` är profil-id -> text). En profil
    vars vektor saknas eller hör till en annan text än den nuvarande saknas i svaret (som profile_vector)."""
    if not profiles:
        return {}
    ids = list(profiles)
    if _is_postgres(db):
        distance = ProfileEmbedding.embedding.cosine_distance(my_vector)
        rows = db.query(ProfileEmbedding.profile_id, ProfileEmbedding.embedding_hash, distance).filter(ProfileEmbedding.profile_id.in_(ids)).all()
        similarities = {profile_id: (digest, 1.0 - float(d)) for profile_id, digest, d in rows}
    else:
        rows = db.query(ProfileEmbedding.profile_id, ProfileEmbedding.embedding_hash, ProfileEmbedding.embedding).filter(ProfileEmbedding.profile_id.in_(ids)).all()
        similarities = {profile_id: (digest, _cosine_similarity(my_vector, list(vector))) for profile_id, digest, vector in rows}
    return {
        profile_id: similarity
        for profile_id, (digest, similarity) in similarities.items()
        if digest == text_hash(profiles[profile_id].strip())
    }


def suggestions_for(db: Session, user_id: int, limit: int, offset: int = 0, config: MatchConfig = DEFAULT_CONFIG) -> SuggestionPage:
    """En sida förslag för user_id, bäst först. Stoppas användaren av minimikraven är listan tom och `readiness` säger vad
    som saknas. Poängen räknas för alla som kan föreslås på varje anrop, så att ordningen är densamma på alla sidor."""
    profile = get_profile(db, user_id)
    if profile is None:
        return SuggestionPage(Readiness(False, MIN_INTERESTS, MIN_TEXT_CHARS))
    my_interests = _interests_by_user(db, {user_id})[user_id]
    me = Person(id=user_id, interests=frozenset(my_interests), text_chars=len((profile.profile_text or "").strip()), text_vector=profile_vector(db, profile))
    ready = readiness(me)
    if not ready.ok:
        return SuggestionPage(ready)

    candidates = db.query(Profile.id, Profile.user_id, Profile.profile_text).filter(Profile.name.isnot(None), Profile.user_id != user_id)
    hidden = hidden_user_ids(db, user_id)
    if hidden:
        candidates = candidates.filter(Profile.user_id.notin_(hidden))
    people: dict[int, tuple[int, str]] = {}  # användar-id -> (profil-id, text)
    for profile_id, other_id, text in candidates:
        people[other_id] = (profile_id, (text or "").strip())
    interests = _interests_by_user(db, set(people))
    eligible = {
        other_id: Person(id=other_id, interests=frozenset(interests[other_id]), text_chars=len(text))
        for other_id, (_, text) in people.items()
        if readiness(Person(id=other_id, interests=frozenset(interests[other_id]), text_chars=len(text))).ok
    }

    near = near_cosines(db, set(my_interests), {other_id: set(person.interests) for other_id, person in eligible.items()})
    texts = text_cosines(db, me.text_vector, {people[other_id][0]: people[other_id][1] for other_id in eligible}) if me.text_vector else {}
    parents = load_tree(db).parents

    ranked = []
    for other_id, other in eligible.items():
        match = combine(me, other, parents, near.get(other_id), texts.get(people[other_id][0]), config)
        if match is not None and match.percent >= MIN_SHOWN_PERCENT:
            ranked.append(Suggestion(other_id, match))
    ranked.sort(key=lambda s: (-s.match.percent, s.user_id))
    return SuggestionPage(ready, ranked[offset : offset + limit], has_more=len(ranked) > offset + limit)
