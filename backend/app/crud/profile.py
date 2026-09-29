from datetime import date

from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.schemas.profile import ProfileUpdate


def calculate_age(birth_date: date) -> int:
    today = date.today()
    had_birthday_this_year = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday_this_year else 1)


def get_profile(db: Session, user_id: int) -> Profile | None:
    return db.query(Profile).filter(Profile.user_id == user_id).first()


def update_profile(db: Session, user_id: int, data: ProfileUpdate) -> Profile:
    profile = get_profile(db, user_id)
    if profile is None:
        profile = Profile(user_id=user_id)
        db.add(profile)

    # Uppdatera bara de fält som faktiskt skickades med
    if data.name is not None:
        profile.name = data.name
    if data.birth_date is not None:
        profile.birth_date = data.birth_date
    if data.gender is not None:
        profile.gender = data.gender

    db.commit()
    db.refresh(profile)
    return profile