from sqlalchemy import or_
from sqlalchemy.orm import Session

# Samma skydd mot jokertecken (% och _) som klubbsökningen.
from app.crud.group import _escape_like
from app.models.interest import Interest, InterestStatus
from app.models.user import User

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


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def sorted_interests(user: User) -> list[Interest]:
    return sorted(user.interests, key=lambda i: i.name)


def add_user_interest(db: Session, user: User, interest: Interest) -> list[Interest]:
    # Redan tillagt → inget att göra, så anropet kan upprepas utan fel.
    if interest not in user.interests:
        user.interests.append(interest)
        db.commit()
    return sorted_interests(user)


def remove_user_interest(db: Session, user: User, interest: Interest) -> list[Interest]:
    if interest in user.interests:
        user.interests.remove(interest)
        db.commit()
    return sorted_interests(user)
