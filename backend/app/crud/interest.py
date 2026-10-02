from sqlalchemy.orm import Session

from app.models.interest import Interest
from app.models.user import User


def list_interests(db: Session) -> list[Interest]:
    return db.query(Interest).order_by(Interest.name).all()


def get_interest(db: Session, interest_id: int) -> Interest | None:
    return db.get(Interest, interest_id)


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
