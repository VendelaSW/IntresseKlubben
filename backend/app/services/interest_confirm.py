"""
Sparar de förslag användaren godkänt (förslagen kommer från POST /interests/analyze, se interest_analysis.py).

Förslagen bevisar sig med sitt sigill (analysis_token): bara förslag som sigillet täcker sparas, och inget som
användaren eller någon annan hittat på. Av förslagen sparas bara de som skickas med, resten räknas som bortvalda.

För varje godkänt förslag:
- finns intresset i biblioteket kopplas det till användaren, en rad per vald aktivitet (inga aktiviteter ger en rad
  utan aktivitet). En aktivitet måste vara en av de som sigillet tillåter för förslaget.
- har användaren svarat på en huvudområdesfråga (`narrow_to`) byts området mot de valda underintressena.
- är det ett nytt intresse skapas det som ett eget intresse under sin förälder, med skapare, och kopplas till
  användaren. Skapas bara om inget befintligt intresse under samma förälder redan heter så (då används det, så att
  två användare som menar samma sak får samma intresse), om namnet är 2-60 tecken och klarar svordomsfiltret, och
  om användaren skapat färre än OWN_INTEREST_LIMIT egna intressen det senaste dygnet.
- är det en sub under ett nytt intresse skapas det nya intresset också, även om det inte godkändes självt (subben
  behöver sin plats i trädet), men det kopplas bara till användaren om det godkändes.

Dubbletter från flera svar slås ihop. Inget sparas förrän allt är kontrollerat, och funktionen gör ingen commit:
anroparen gör det, så att ett fel inte lämnar något halvsparat.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core import error_messages as msg
from app.core.profanity import contains_profanity
from app.crud.interest import load_library_index
from app.models.interest import Interest, InterestSource, InterestStatus
from app.models.user import User
from app.models.user_interest import UserInterest
from app.services.analysis_token import AnalysisTokenUnavailable, InvalidAnalysisToken, read_token
from app.services.interest_embeddings import embed_interests
from app.services.interest_matching import normalize

OWN_INTEREST_LIMIT = 20  # egna intressen en användare får skapa per dygn
OWN_INTEREST_WINDOW = timedelta(hours=24)
MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 60
MAX_LEVEL = 3


class ConfirmError(Exception):
    """Något i anropet går inte att spara. `status` är HTTP-koden och `message` förklaringen, på svenska."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class ApprovedItem:
    key: str  # nyckeln på förslaget i analysen (p1, p2...)
    activities: tuple[str, ...] = ()  # valda aktiviteter, tomt = ingen
    narrow_to: tuple[int, ...] = ()  # valda underintressen (id) om ett huvudområde


@dataclass(frozen=True)
class Batch:
    token: str  # sigillet från analysen
    items: tuple[ApprovedItem, ...]


@dataclass
class _New:
    """Ett nytt intresse att skapa, eller ett befintligt att återanvända."""

    ref: tuple[int, str]  # (omgång, förslagets nyckel)
    name: str
    parent_id: int | None  # ett befintligt intresse, eller None om föräldern är en annan ny
    parent_ref: tuple[int, str] | None
    allowed: list[str]
    level: int = 0
    id: int | None = None
    create: bool = False
    same_as: "_New | None" = None  # ett annat nytt förslag som är samma intresse (från ett annat svar)


def _root(new: "_New") -> "_New":
    """Det nya intresset förslaget slagits ihop med (eller det självt)."""
    while new.same_as is not None:
        new = new.same_as
    return new


@dataclass
class _Wanted:
    """De intressen som ska kopplas till användaren: ("id", id) eller ("new", ref), med sina aktiviteter."""

    activities: dict = field(default_factory=dict)  # mål -> aktiviteter i den ordning de kom

    def add(self, target: tuple, activities: tuple[str, ...]) -> None:
        current = self.activities.setdefault(target, [])
        for activity in activities or ("",):
            if activity not in current:
                current.append(activity)

    def resolved(self) -> dict:
        """Aktiviteterna per mål. En rad utan aktivitet behövs inte när det finns en med."""
        return {t: [a for a in acts if a] or [""] for t, acts in self.activities.items()}


def _error(status: int, message: str) -> ConfirmError:
    return ConfirmError(status, message)


def _checked_claims(batch: Batch, user_id: int) -> dict[str, dict]:
    """Förslagen i sigillet, per nyckel. Ogiltigt, utgånget eller någon annans sigill ger 400."""
    try:
        raw = read_token(batch.token, user_id)
    except InvalidAnalysisToken:
        raise _error(400, msg.CONFIRM_SEAL_INVALID) from None
    except AnalysisTokenUnavailable:
        raise _error(503, msg.CONFIRM_UNAVAILABLE) from None
    claims: dict[str, dict] = {}
    for claim in raw:
        valid = (
            isinstance(claim, dict)
            and isinstance(claim.get("key"), str)
            and isinstance(claim.get("allowed"), list)
            and (isinstance(claim.get("interest_id"), int) or isinstance(claim.get("new"), dict))
        )
        if not valid:
            raise _error(400, msg.CONFIRM_SEAL_INVALID)
        claims[claim["key"]] = claim
    return claims


def _register_new(news: dict, claims: list[dict[str, dict]], ref: tuple[int, str], stack: tuple = ()) -> _New:
    """Det nya intresset ett förslag stått för, och (först) det nya intresse det ligger under."""
    if ref in news:
        return news[ref]
    if ref in stack:  # en cirkel i förälderkedjan: aldrig i ett äkta sigill
        raise _error(400, msg.CONFIRM_SEAL_INVALID)
    batch_index, key = ref
    claim = claims[batch_index].get(key)
    if claim is None or not isinstance(claim.get("new"), dict) or not isinstance(claim["new"].get("name"), str):
        raise _error(400, msg.CONFIRM_SEAL_INVALID)
    spec = claim["new"]
    parent_ref = (batch_index, spec["parent_key"]) if isinstance(spec.get("parent_key"), str) else None
    if parent_ref is not None:
        _register_new(news, claims, parent_ref, (*stack, ref))  # föräldern registreras först, så att den skapas först
    elif not isinstance(spec.get("parent_id"), int):
        raise _error(400, msg.CONFIRM_SEAL_INVALID)
    new = _New(ref, spec["name"], spec.get("parent_id"), parent_ref, [a for a in claim["allowed"] if isinstance(a, str)])
    news[ref] = new
    return new


def apply_batches(db: Session, user: User, batches: list[Batch], source: str) -> None:
    """Sparar förslagen i `batches` på användaren, utan commit. Kastar ConfirmError om något inte går att spara.
    `source` är UserInterestSource för raderna."""
    index = load_library_index(db)
    claims = [_checked_claims(batch, user.id) for batch in batches]

    news: dict[tuple[int, str], _New] = {}
    wanted = _Wanted()
    for batch_index, batch in enumerate(batches):
        for item in batch.items:
            claim = claims[batch_index].get(item.key)
            if claim is None:
                raise _error(400, msg.CONFIRM_UNKNOWN_PROPOSAL)
            allowed = [a for a in claim["allowed"] if isinstance(a, str)]
            if any(activity not in allowed for activity in item.activities):
                raise _error(400, msg.CONFIRM_ACTIVITY_NOT_ALLOWED)

            if isinstance(claim.get("interest_id"), int):
                interest_id = claim["interest_id"]
                if interest_id not in index.by_id:
                    raise _error(400, msg.CONFIRM_INTEREST_GONE)
                if item.narrow_to:
                    # Svaret på "Något särskilt inom musik?": de valda underintressena i stället för området.
                    for child_id in item.narrow_to:
                        if child_id not in index.by_id or index.by_id[child_id].parent_id != interest_id:
                            raise _error(400, msg.CONFIRM_NARROW_NOT_ALLOWED)
                        wanted.add(("id", child_id), item.activities)
                else:
                    wanted.add(("id", interest_id), item.activities)
            else:
                if item.narrow_to:
                    raise _error(400, msg.CONFIRM_NARROW_NOT_ALLOWED)
                ref = (batch_index, item.key)
                _register_new(news, claims, ref)
                wanted.add(("new", ref), item.activities)

    # Vilka nya intressen som redan finns (då används de), vilka som är samma sak i flera svar (då slås de ihop),
    # och vilka som ska skapas.
    seen: dict[tuple, _New] = {}
    for new in news.values():  # föräldrar före barn
        if new.parent_ref is None:
            parent = index.by_id.get(new.parent_id)
            if parent is None:
                raise _error(400, msg.CONFIRM_INTEREST_GONE)
            parent_real, new.level, parent_key = parent.id, parent.level + 1, ("id", parent.id)
        else:
            parent_node = _root(news[new.parent_ref])
            parent_real, new.level = parent_node.id, parent_node.level + 1
            parent_key = ("id", parent_real) if parent_real is not None else ("new", id(parent_node))
        key = (normalize(new.name), parent_key)
        if key in seen:
            new.same_as = seen[key]
            continue
        seen[key] = new
        if parent_real is not None:  # föräldern finns redan: finns intresset under den?
            existing = [i for i in index.items if i.parent_id == parent_real and normalize(i.name) == normalize(new.name)]
            if existing:
                new.id = existing[0].id
                continue
        if new.level > MAX_LEVEL:
            raise _error(400, msg.CONFIRM_SEAL_INVALID)
        if parent_real is not None and not index.by_id[parent_real].allow_children:
            raise _error(400, msg.CONFIRM_PARENT_CLOSED)  # en plattform som PlayStation får inga nya underintressen
        if not (MIN_NAME_LENGTH <= len(new.name.strip()) <= MAX_NAME_LENGTH) or contains_profanity(new.name):
            raise _error(400, msg.CONFIRM_OWN_INTEREST_NAME)
        new.create = True

    creating = [n for n in news.values() if n.create]
    if creating and _own_interests_today(db, user) + len(creating) > OWN_INTEREST_LIMIT:
        raise _error(429, msg.CONFIRM_TOO_MANY_OWN_INTERESTS)

    created: list[Interest] = []
    for new in news.values():  # föräldrar före barn
        if not new.create:
            continue
        parent_node = None if new.parent_ref is None else _root(news[new.parent_ref])
        parent_id = new.parent_id if parent_node is None else parent_node.id
        inherited = index.effective_activities(parent_id) if parent_node is None else parent_node.allowed
        interest = Interest(
            name=new.name.strip(),
            parent_id=parent_id,
            status=InterestStatus.active.value,
            source=InterestSource.ai.value,
            created_by_user_id=user.id,
            # Egna aktiviteter bara när de skiljer sig från det som ärvs.
            activities=list(new.allowed) if new.allowed != list(inherited) else None,
        )
        db.add(interest)
        db.flush()  # ger id, som barnen och kopplingarna behöver
        new.id = interest.id
        created.append(interest)
    # De nya intressena får en vektor direkt, så att de går att hitta på betydelse. Det får aldrig stoppa sparandet:
    # går det inte fyller `python -m app.sync_embeddings` i dem senare.
    embed_interests(db, created)

    existing_rows = {(link.interest_id, link.activity) for link in user.interest_links}
    for target, activities in wanted.resolved().items():
        interest_id = target[1] if target[0] == "id" else _root(news[target[1]]).id
        for activity in activities:
            if (interest_id, activity) in existing_rows:
                continue
            existing_rows.add((interest_id, activity))
            user.interest_links.append(UserInterest(interest=db.get(Interest, interest_id), activity=activity, source=source))
    db.flush()


def _own_interests_today(db: Session, user: User) -> int:
    since = datetime.now(timezone.utc) - OWN_INTEREST_WINDOW
    return db.query(Interest).filter(Interest.created_by_user_id == user.id, Interest.created_at >= since).count()
