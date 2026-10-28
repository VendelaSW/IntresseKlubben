from datetime import date

from sqlalchemy import and_, case, distinct, func
from sqlalchemy.orm import Session, selectinload

from app.crud.interest import set_user_interests
from app.models.interest import Interest, InterestStatus
from app.models.profile import GenderEnum, Profile
from app.models.user import User
from app.models.user_interest import UserInterest
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

    # Bara intressen som går att välja; ett inaktivt räknas som okänt.
    interests = (
        db.query(Interest)
        .filter(Interest.id.in_(data.interest_ids), Interest.status == InterestStatus.active.value)
        .all()
    )
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
        age_hidden=data.age_hidden,
    )
    db.add(profile)
    # Inte user.interests = interests: det kraschar om användaren redan har
    # något av intressena (se set_user_interests).
    set_user_interests(db.get(User, user_id), interests)
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
    # Stadsdel är valfri: skickas den med som null tas den bort. Skickas den
    # inte med alls lämnas den orörd, som de andra fälten.
    if "district" in data.model_fields_set:
        profile.district = data.district
    if data.profile_text is not None:
        if data.profile_text.strip() != (profile.profile_text or "").strip():
            profile.embedding_row = None  # den gamla vektorn hör till en text som inte längre finns: bort i samma commit
        profile.profile_text = data.profile_text
    if data.gender_searchable is not None:
        profile.gender_searchable = data.gender_searchable
    if data.age_hidden is not None:
        profile.age_hidden = data.age_hidden

    db.commit()
    db.refresh(profile)
    return profile


def _people_query(
    db: Session,
    exclude_user_id: int,
    interest_ids: set[int] | None = None,
    municipality_code: str | None = None,
    exclude_user_ids: set[int] | None = None,
    gender: GenderEnum | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
):
    """Filtret som både listan (list_people) och räkningen (count_people_by_node) bygger på, så att siffran och listan aldrig kan
    skilja sig: andra användare med sparad profil, utan dig själv och utan exclude_user_ids. Har en person flera av
    intressena i interest_ids räknas hen ändå en gång."""
    query = (
        db.query(Profile)
        .join(User, User.id == Profile.user_id)
        .filter(Profile.name.isnot(None), Profile.user_id != exclude_user_id)
    )
    if exclude_user_ids:
        query = query.filter(Profile.user_id.notin_(exclude_user_ids))
    if interest_ids:
        query = query.filter(User.interests.any(Interest.id.in_(interest_ids)))
    return filter_by_profile(query, municipality_code, gender, min_age, max_age)


def filter_by_profile(
    query,
    municipality_code: str | None = None,
    gender: GenderEnum | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
):
    """Filtret på kommun, kön och ålder för en fråga över Profile. Det delas av listan (list_people) och förslagen (GET /matches),
    så att de aldrig kan skilja sig, och det är det som hindrar filtret från att avslöja något man har valt att dölja."""
    if municipality_code is not None:
        query = query.filter(Profile.municipality_code == municipality_code)
    if gender is not None:
        query = query.filter(Profile.gender == gender, Profile.gender_searchable.is_(True))
    if min_age is not None or max_age is not None:
        # Den som har dolt sin ålder kommer inte med när man filtrerar på ålder, så att filtret inte avslöjar
        # åldern (SCRUM-134), på samma sätt som kön och gender_searchable.
        query = query.filter(Profile.age_hidden.is_(False))
    if min_age is not None:
        query = query.filter(Profile.birth_date <= _latest_birth_date_for_age(min_age))
    if max_age is not None:
        query = query.filter(Profile.birth_date > _latest_birth_date_for_age(max_age + 1))
    return query


def list_people(
    db: Session,
    exclude_user_id: int,
    interest_id: int | None = None,
    municipality_code: str | None = None,
    exclude_user_ids: set[int] | None = None,
    gender: GenderEnum | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
    *,
    interest_ids: set[int] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Profile]:
    """Andra användare med sparad profil, valfritt filtrerade på intresse,
    kommun, kön och ålder (min_age och max_age räknas med, som calculate_age).
    exclude_user_ids är en extra uteslutningslista utöver dig själv -
    används för tidigare borttagna förslag (se crud/dismissed_suggestion.py).
    interest_ids tar personer som har något av flera intressen (ett intresse och dess underintressen,
    se crud/interest_people.py), och limit och offset sidindelar listan.

    Filtret på kön tar bara med dem som valt gender_searchable, eftersom
    träffarna annars avslöjar könet hos alla andra."""
    ids = set(interest_ids or ())
    if interest_id is not None:
        ids.add(interest_id)
    query = _people_query(db, exclude_user_id, ids or None, municipality_code, exclude_user_ids, gender, min_age, max_age).options(
        selectinload(Profile.municipality),
        selectinload(Profile.user).selectinload(User.interest_links).selectinload(UserInterest.interest),
        selectinload(Profile.user).selectinload(User.profile),  # annars hämtas profilen en gång till per person (to_person_response)
    )
    query = query.order_by(Profile.name, Profile.id).offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


def count_people_by_municipality(
    db: Session, exclude_user_id: int, exclude_user_ids: set[int] | None = None
) -> dict[str, int]:
    """Hur många andra personer med profil som bor i varje kommun (kommunkod -> antal), med samma filter som list_people.
    Kommuner där ingen bor finns inte med. Bara antal, aldrig vilka (SCRUM-82)."""
    rows = (
        _people_query(db, exclude_user_id, None, None, exclude_user_ids)
        .with_entities(Profile.municipality_code, func.count(Profile.id))
        .group_by(Profile.municipality_code)
        .all()
    )
    return {code: count for code, count in rows if code}


def count_people_by_node(
    db: Session,
    exclude_user_id: int,
    nodes: dict[int, set[int]],
    municipality_code: str | None = None,
    exclude_user_ids: set[int] | None = None,
) -> dict[int, tuple[int, int | None]]:
    """Hur många andra personer som har något av intressena i varje nod (nod-id -> intresse-id:n, se crud/interest_people.py):
    i hela landet och, om municipality_code är satt, i den kommunen. Samma filter som list_people (en person räknas en gång per
    nod), men för alla noder i en enda fråga: en villkorlig räkning per nod (och kommun), över alla som har något av intressena."""
    all_ids = set().union(*nodes.values()) if nodes else set()
    columns = []
    for interest_ids in nodes.values():
        in_node = UserInterest.interest_id.in_(interest_ids)
        columns.append(func.count(distinct(case((in_node, Profile.id)))))
        if municipality_code is not None:
            columns.append(func.count(distinct(case((and_(in_node, Profile.municipality_code == municipality_code), Profile.id)))))
    if not columns:
        return {}
    row = (
        _people_query(db, exclude_user_id, None, None, exclude_user_ids)
        .join(UserInterest, UserInterest.user_id == Profile.user_id)
        .filter(UserInterest.interest_id.in_(all_ids))
        .with_entities(*columns)
        .one()
    )
    step = 2 if municipality_code is not None else 1
    return {
        node_id: (int(row[i * step]), int(row[i * step + 1]) if municipality_code is not None else None)
        for i, node_id in enumerate(nodes)
    }


def set_profile_image(db: Session, profile: Profile, key: str) -> str | None:
    """Sparar nya bildens nyckel i bucketen och returnerar den gamla (om någon)."""
    old_key = profile.profile_image_url
    profile.profile_image_url = key
    db.commit()
    db.refresh(profile)
    return old_key