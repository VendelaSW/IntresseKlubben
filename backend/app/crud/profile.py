from datetime import date

from sqlalchemy.orm import Session, selectinload

from app.models.interest import Interest
from app.models.profile import GenderEnum, Profile
from app.models.user import User
from app.schemas.profile import ProfileCreate, ProfileUpdate


class ProfileExistsError(Exception):
    """Användaren har redan en profil."""


class ProfileNotFoundError(Exception):
    """Användaren har ingen profil än."""


class UnknownInterestError(Exception):
    """Minst ett av de angivna intressena finns inte."""


def calculate_age(birth_date: date) -> int:
    today = date.today()
    had_birthday_this_year = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday_this_year else 1)


def _latest_birth_date_for_age(age: int) -> date:
    """Senaste födelsedatum som ger minst `age` år i dag, enligt calculate_age.
    Är det 29 februari i dag och inte skottår då, räknas 28 februari (den som
    är född 1 mars har inte fyllt än)."""
    today = date.today()
    try:
        return today.replace(year=today.year - age)
    except ValueError:
        return today.replace(year=today.year - age, day=28)


def get_profile(db: Session, user_id: int) -> Profile | None:
    return db.query(Profile).filter(Profile.user_id == user_id).first()


def create_profile(db: Session, user_id: int, data: ProfileCreate) -> Profile:
    """Skapar profilen och sätter användarens intressen i samma transaktion, så
    att en profil aldrig finns utan intresse."""
    if get_profile(db, user_id) is not None:
        raise ProfileExistsError(user_id)

    interests = db.query(Interest).filter(Interest.id.in_(data.interest_ids)).all()
    if len(interests) != len(data.interest_ids):
        raise UnknownInterestError()

    profile = Profile(
        user_id=user_id,
        name=data.name,
        birth_date=data.birth_date,
        gender=data.gender,
        municipality_code=data.municipality_code,
        profile_text=data.profile_text,
        district=data.district,
        gender_searchable=data.gender_searchable,
    )
    db.add(profile)
    db.get(User, user_id).interests = interests
    db.commit()
    db.refresh(profile)
    return profile


def update_profile(db: Session, user_id: int, data: ProfileUpdate) -> Profile:
    profile = get_profile(db, user_id)
    if profile is None:
        raise ProfileNotFoundError(user_id)

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
        profile.profile_text = data.profile_text
    if data.gender_searchable is not None:
        profile.gender_searchable = data.gender_searchable

    db.commit()
    db.refresh(profile)
    return profile


def list_people(
    db: Session,
    exclude_user_id: int,
    interest_id: int | None = None,
    municipality_code: str | None = None,
    exclude_user_ids: set[int] | None = None,
    gender: GenderEnum | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
) -> list[Profile]:
    """Andra användare med sparad profil, valfritt filtrerade på intresse,
    kommun, kön och ålder (min_age och max_age räknas med, som calculate_age).
    exclude_user_ids är en extra uteslutningslista utöver dig själv -
    används för tidigare borttagna förslag (se crud/dismissed_suggestion.py).

    Filtret på kön tar bara med dem som valt gender_searchable, eftersom
    träffarna annars avslöjar könet hos alla andra."""
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
    if gender is not None:
        query = query.filter(Profile.gender == gender, Profile.gender_searchable.is_(True))
    if min_age is not None:
        query = query.filter(Profile.birth_date <= _latest_birth_date_for_age(min_age))
    if max_age is not None:
        query = query.filter(Profile.birth_date > _latest_birth_date_for_age(max_age + 1))
    return query.order_by(Profile.name).all()


def set_profile_image(db: Session, profile: Profile, key: str) -> str | None:
    """Sparar nya bildens nyckel i bucketen och returnerar den gamla (om någon)."""
    old_key = profile.profile_image_url
    profile.profile_image_url = key
    db.commit()
    db.refresh(profile)
    return old_key