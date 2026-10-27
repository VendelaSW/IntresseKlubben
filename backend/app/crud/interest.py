from dataclasses import dataclass

from sqlalchemy import distinct, event, func, or_, select
from sqlalchemy.orm import Session

# Samma skydd mot jokertecken (% och _) som klubbsökningen.
from app.crud.group import _escape_like
from app.models.interest import Interest, InterestSource, InterestStatus
from app.models.user import User
from app.models.user_interest import PRACTISES, UserInterest
from app.services.interest_matching import LibraryIndex, LibraryItem

# Hur många träffar en sökning ger som mest.
SEARCH_LIMIT = 20

# Så många användare ska ha ett eget intresse (skaparen räknas med) innan det syns för andra i Utforska och sökningen.
# Ett eget intresse som färre har hittas i stället på betydelse ("Menade du", se services/interest_embeddings.py).
MIN_USERS_FOR_OWN_INTEREST = 3


def _active(db: Session):
    return db.query(Interest).filter(Interest.status == InterestStatus.active.value)


def _visible_to(viewer_id: int):
    """Villkoret för vilka intressen `viewer_id` får se när hen bläddrar och söker: bibliotekets, sina egna, och egna intressen
    som minst MIN_USERS_FOR_OWN_INTEREST användare har. Räkningen görs bara för egna intressen och bara för raderna som
    frågan annars skulle ge (indexet på user_interests.interest_id)."""
    users = (
        select(func.count(distinct(UserInterest.user_id))).where(UserInterest.interest_id == Interest.id).scalar_subquery()
    )
    return or_(
        Interest.source == InterestSource.library.value,
        Interest.created_by_user_id == viewer_id,
        users >= MIN_USERS_FOR_OWN_INTEREST,
    )


def list_interests(db: Session) -> list[Interest]:
    """Alla aktiva intressen, platt. Används av filter och formulär som väljer
    ett intresse (klubbar, events, personer)."""
    return _active(db).order_by(Interest.name).all()


def list_top_interests(db: Session, viewer_id: int) -> list[Interest]:
    """Huvudområdena (intressen utan förälder), för "Utforska"."""
    return _active(db).filter(Interest.parent_id.is_(None), _visible_to(viewer_id)).order_by(Interest.name).all()


def list_child_interests(db: Session, interest: Interest, viewer_id: int) -> list[Interest]:
    return _active(db).filter(Interest.parent_id == interest.id, _visible_to(viewer_id)).order_by(Interest.name).all()


def search_interests(db: Session, query: str, viewer_id: int, limit: int = SEARCH_LIMIT) -> list[Interest]:
    """Aktiva intressen som `viewer_id` får se (se _visible_to) vars namn eller alias innehåller söktexten (oavsett
    stora/små bokstäver). Bästa träffarna först: exakt namn, namnet börjar med
    texten, namnet innehåller texten, sist bara alias."""
    text = " ".join(query.split()).lower()
    if not text:
        return []
    pattern = f"%{_escape_like(text)}%"
    candidates = _active(db).filter(
        or_(Interest.name.ilike(pattern, escape="\\"), Interest.aliases.ilike(pattern, escape="\\")),
        _visible_to(viewer_id),
    ).all()

    def rank(interest: Interest) -> tuple[int, str]:
        name = interest.name.lower()
        if name == text:
            return (0, name)
        if name.startswith(text):
            return (1, name)
        if text in name:
            return (2, name)
        return (3, name)

    return sorted(candidates, key=rank)[:limit]


def _ancestor_ids(parents: dict[int, int | None], interest_id: int) -> list[int]:
    """Id:na ovanför intresset i trädet, uppifrån. `parents` är id -> förälderns id för de intressen som
    räknas; vandringen stannar vid en förälder som inte finns där (t.ex. en inaktiv) och efter tio steg
    (skydd mot en cirkel). Används av både biblioteksindexet och interest_places."""
    chain: list[int] = []
    parent = parents.get(interest_id)
    while parent is not None and parent in parents and len(chain) < 10:
        chain.insert(0, parent)
        parent = parents[parent]
    return chain


def load_library_index(db: Session) -> LibraryIndex:
    """Alla aktiva intressen som ett uppslagsregister för matchningen (se
    services/interest_matching.py): nivå, plats i trädet, alias och om intresset är ett eget som en
    användare skapat. Hämtas med en fråga, och trädet byggs i minnet."""
    rows = _active(db).all()
    by_id = {row.id: row for row in rows}
    parents = {row.id: row.parent_id for row in rows}

    items = []
    for row in rows:
        chain = [by_id[i] for i in _ancestor_ids(parents, row.id)]
        items.append(
            LibraryItem(
                id=row.id,
                name=row.name,
                aliases=tuple(alias.strip() for alias in (row.aliases or "").split("\n") if alias.strip()),
                parent_id=row.parent_id if row.parent_id in by_id else None,
                level=len(chain) + 1,
                path=tuple(parent.name for parent in chain),
                own=row.source != InterestSource.library.value,
                activities=tuple(row.activities) if row.activities is not None else None,
                allow_children=row.allow_children is not False,
            )
        )
    items.sort(key=lambda item: (*item.path, item.name))
    return LibraryIndex(items)


@dataclass(frozen=True)
class InterestPlace:
    """Var ett intresse ligger i trädet: namnen ovanför, uppifrån (path, t.ex. ("Kreativitet",
    "Fotografering") för Porträttfoto, () för ett huvudområde), och huvudområdets namn och slug. Taggarnas
    färg följer huvudområdet, och slår upp den på sluggen så att den håller när området byter namn
    (se frontend/src/utils/interestColors.js)."""

    path: tuple[str, ...]
    area: str
    area_slug: str | None


# Trädet (id -> (namn, slug, förälder)) sparas i sessionen, så att en hel lista med intressen bara
# kostar en databasfråga i stället för en per förälder. Det glöms när sessionen sparar eller ångrar,
# och hämtas om när ett intresse saknas (t.ex. ett nyss skapat).
_TREE_KEY = "interest_tree"


@event.listens_for(Session, "after_commit")
@event.listens_for(Session, "after_rollback")
def _forget_interest_tree(session: Session) -> None:
    session.info.pop(_TREE_KEY, None)


def _interest_tree(db: Session, needed_ids: list[int]) -> dict[int, tuple[str, str | None, int | None]]:
    tree = db.info.get(_TREE_KEY)
    if tree is None or any(i not in tree for i in needed_ids):
        rows = db.query(Interest.id, Interest.name, Interest.slug, Interest.parent_id)
        tree = {row.id: (row.name, row.slug, row.parent_id) for row in rows}
        db.info[_TREE_KEY] = tree
    return tree


def interest_places(db: Session, interests: list[Interest]) -> dict[int, InterestPlace]:
    """Platsen i trädet för varje intresse (id -> InterestPlace), med en databasfråga för hela listan."""
    if not interests:
        return {}
    tree = _interest_tree(db, [i.id for i in interests])
    parents = {interest_id: parent_id for interest_id, (_, _, parent_id) in tree.items()}

    def place(interest_id: int) -> InterestPlace:
        chain = _ancestor_ids(parents, interest_id)
        top = chain[0] if chain else interest_id
        return InterestPlace(path=tuple(tree[i][0] for i in chain), area=tree[top][0], area_slug=tree[top][1])

    return {i.id: place(i.id) for i in interests}


def interest_place(db: Session, interest: Interest) -> InterestPlace:
    return interest_places(db, [interest])[interest.id]


def profile_interests(db: Session, user: User) -> list[dict]:
    """Användarens intressen i namnordning, i den form ProfileInterest (schemas/interest.py) vill ha: med
    platsen i trädet för hela listan på en gång, och om personen själv håller på med intresset (practices)."""
    interests = sorted_interests(user)
    places = interest_places(db, interests)
    practised = {link.interest_id for link in user.interest_links if link.activity == PRACTISES}
    return [
        {
            "id": i.id,
            "name": i.name,
            "parent_id": i.parent_id,
            "path": list(places[i.id].path),
            "area": places[i.id].area,
            "area_slug": places[i.id].area_slug,
            "practices": i.id in practised,
        }
        for i in interests
    ]


def ids_with_children(db: Session, interests: list[Interest]) -> set[int]:
    """Vilka av intressena som har minst ett aktivt underintresse."""
    ids = [i.id for i in interests]
    if not ids:
        return set()
    rows = _active(db).with_entities(Interest.parent_id).filter(Interest.parent_id.in_(ids)).distinct()
    return {row[0] for row in rows}


def get_interest(db: Session, interest_id: int) -> Interest | None:
    return db.get(Interest, interest_id)


def get_active_interest(db: Session, interest_id: int) -> Interest | None:
    """Intresset om det går att välja (inte inaktivt eller väntande), annars None."""
    interest = db.get(Interest, interest_id)
    return interest if interest is not None and interest.status == InterestStatus.active.value else None


def allowed_activities(interest: Interest) -> list[str]:
    """Hur intresset kan utövas, som slugs ur bibliotekets aktivitetslista.

    Ett intresse utan egen lista ärver förälderns, så att Pokémon TCG får
    Kortspels "spela" och "samla" men aldrig "odla". En tom lista betyder
    uttryckligen inga. Också ett huvudområdes egen lista räknas: den som skriver
    "jag gillar att lyssna på musik" får Musik med "lyssna". Skriver man inget om
    hur, sätts ingen aktivitet (det avgörs av analysen, inte av den här listan)."""
    node = interest
    while node is not None:
        if node.activities is not None:
            return list(node.activities)
        node = node.parent
    return []


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def sorted_interests(user: User) -> list[Interest]:
    """Användarens intressen i namnordning. Ett intresse som sparats med flera
    aktiviteter kommer med en gång."""
    unique = {interest.id: interest for interest in user.interests}
    return sorted(unique.values(), key=lambda i: i.name)


def set_user_interests(user: User, interests: list[Interest]) -> None:
    """Gör så att användaren har exakt de här intressena, utan att spara.

    Rader som redan finns behålls som de är, med aktivitet och egna ord. De som
    inte längre är med tas bort, och de som saknas läggs till utan aktivitet.
    Att i stället tilldela user.interests en ny lista skapar nya rader för allt,
    också det användaren redan har, och då slår unik-villkoret till."""
    wanted = {interest.id: interest for interest in interests}
    for link in list(user.interest_links):
        if link.interest.id not in wanted:
            user.interest_links.remove(link)
    existing = {link.interest.id for link in user.interest_links}
    for interest_id, interest in wanted.items():
        if interest_id not in existing:
            user.interest_links.append(UserInterest(interest=interest))


def add_user_interest(db: Session, user: User, interest: Interest) -> list[Interest]:
    # Redan tillagt → inget att göra, så anropet kan upprepas utan fel.
    if interest not in user.interests:
        user.interests.append(interest)
        db.commit()
    return sorted_interests(user)


def set_practices(db: Session, user: User, interest_id: int, practices: bool) -> bool:
    """Sparar om användaren själv håller på med intresset (SCRUM-271), eller bara är intresserad. False om
    användaren inte har intresset."""
    link = next((link for link in user.interest_links if link.interest_id == interest_id), None)
    if link is None:
        return False
    link.activity = PRACTISES if practices else ""
    db.commit()
    return True


def remove_user_interest(db: Session, user: User, interest: Interest) -> list[Interest]:
    """Tar bort intresset från profilen."""
    links = [link for link in user.interest_links if link.interest_id == interest.id]
    for link in links:
        user.interest_links.remove(link)
    if links:
        db.commit()
    return sorted_interests(user)
