from sqlalchemy import or_
from sqlalchemy.orm import Session

# Samma skydd mot jokertecken (% och _) som klubbsökningen.
from app.crud.group import _escape_like
from app.models.interest import Interest, InterestSource, InterestStatus
from app.models.user import User
from app.models.user_interest import UserInterest
from app.services.interest_matching import LibraryIndex, LibraryItem

# Hur många träffar en sökning ger som mest.
SEARCH_LIMIT = 20


def _active(db: Session):
    return db.query(Interest).filter(Interest.status == InterestStatus.active.value)


def list_interests(db: Session) -> list[Interest]:
    """Alla aktiva intressen, platt. Används av filter och formulär som väljer
    ett intresse (klubbar, events, personer)."""
    return _active(db).order_by(Interest.name).all()


def list_top_interests(db: Session) -> list[Interest]:
    """Huvudområdena (intressen utan förälder), för "Utforska"."""
    return _active(db).filter(Interest.parent_id.is_(None)).order_by(Interest.name).all()


def list_child_interests(db: Session, interest: Interest) -> list[Interest]:
    return _active(db).filter(Interest.parent_id == interest.id).order_by(Interest.name).all()


def search_interests(db: Session, query: str, limit: int = SEARCH_LIMIT) -> list[Interest]:
    """Aktiva intressen vars namn eller alias innehåller söktexten (oavsett
    stora/små bokstäver). Bästa träffarna först: exakt namn, namnet börjar med
    texten, namnet innehåller texten, sist bara alias."""
    text = " ".join(query.split()).lower()
    if not text:
        return []
    pattern = f"%{_escape_like(text)}%"
    candidates = _active(db).filter(
        or_(Interest.name.ilike(pattern, escape="\\"), Interest.aliases.ilike(pattern, escape="\\"))
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


def load_library_index(db: Session) -> LibraryIndex:
    """Alla aktiva intressen som ett uppslagsregister för matchningen (se
    services/interest_matching.py): nivå, plats i trädet, alias och om intresset är ett eget som en
    användare skapat. Hämtas med en fråga, och trädet byggs i minnet."""
    rows = _active(db).all()
    by_id = {row.id: row for row in rows}

    def ancestors(row: Interest) -> list[Interest]:
        chain: list[Interest] = []
        parent = by_id.get(row.parent_id) if row.parent_id is not None else None
        while parent is not None and len(chain) < 10:  # skydd mot en cirkel
            chain.insert(0, parent)
            parent = by_id.get(parent.parent_id) if parent.parent_id is not None else None
        return chain

    items = []
    for row in rows:
        chain = ancestors(row)
        items.append(
            LibraryItem(
                id=row.id,
                name=row.name,
                aliases=tuple(alias.strip() for alias in (row.aliases or "").split("\n") if alias.strip()),
                parent_id=row.parent_id if row.parent_id in by_id else None,
                level=len(chain) + 1,
                path=tuple(parent.name for parent in chain),
                own=row.source != InterestSource.library.value,
            )
        )
    items.sort(key=lambda item: (*item.path, item.name))
    return LibraryIndex(items)


def interest_path(interest: Interest) -> list[str]:
    """Namnen ovanför intresset i trädet, uppifrån."""
    path = []
    parent = interest.parent
    while parent is not None:
        path.insert(0, parent.name)
        parent = parent.parent
    return path


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
    uttryckligen inga. Ett huvudområde har aldrig någon aktivitet: listan där
    är bara ett standardvärde för det som ligger under."""
    if interest.parent_id is None:
        return []
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


def remove_user_interest(db: Session, user: User, interest: Interest) -> list[Interest]:
    """Tar bort intresset från profilen, med alla aktiviteter det sparats med."""
    links = [link for link in user.interest_links if link.interest_id == interest.id]
    for link in links:
        user.interest_links.remove(link)
    if links:
        db.commit()
    return sorted_interests(user)
