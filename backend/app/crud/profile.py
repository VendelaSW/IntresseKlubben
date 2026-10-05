from datetime import date

from sqlalchemy.orm import Session, selectinload

from app.models.interest import Interest
from app.models.profile import Profile
from app.models.user import User
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
    if data.municipality_code is not None:
        profile.municipality_code = data.municipality_code
    if data.district is not None:
        profile.district = data.district
    if data.profile_text is not None:
        # Tom text (efter trim) tömmer fältet.
        profile.profile_text = data.profile_text or None

    db.commit()
    db.refresh(profile)
    return profile


def list_people(
    db: Session,
    exclude_user_id: int,
    interest_id: int | None = None,
    municipality_code: str | None = None,
    exclude_user_ids: set[int] | None = None,
) -> list[Profile]:
    """Andra användare med sparad profil, valfritt filtrerade på intresse och
    kommun. exclude_user_ids är en extra uteslutningslista utöver dig själv -
    används för tidigare borttagna förslag (se crud/dismissed_suggestion.py)."""
    query = (
        db.query(Profile)
        .join(User, User.id == Profile.user_id)
        .options(selectinload(Profile.municipality), selectinload(Profile.user).selectinload(User.interests))
        .filter(Profile.name.isnot(None), Profile.user_id != exclude_user_id)
    )
    if exclude_user_ids:
        query = query.filter(Profile.user_id.notin_(exclude_user_ids))
    if interest_id is not None:
        query = query.filter(User.interests.any(Interest.id == interest_id))
    if municipality_code is not None:
        query = query.filter(Profile.municipality_code == municipality_code)
    return query.order_by(Profile.name).all()


def set_profile_image(db: Session, profile: Profile, key: str) -> str | None:
    """Sparar nya bildens nyckel i bucketen och returnerar den gamla (om någon)."""
    old_key = profile.profile_image_url
    profile.profile_image_url = key
    db.commit()
    db.refresh(profile)
    return old_key