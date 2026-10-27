"""Hur en annan användare visas i listor: personkorten på Personer
(GET /users/) och kontakterna och förfrågningarna (GET /contacts).

Bara det som syns på ett personkort: namn, ålder (aldrig födelsedatum),
kommun, stadsdel, bild och intressen. Aldrig e-post, kön eller annat privat
(se AGENTS.md, "Other users' data").
"""

from app.core import storage
from app.crud.interest import sorted_interests
from app.crud.profile import calculate_age
from app.models.user import User
from app.schemas.interest import ProfileInterest
from app.schemas.profile import PersonResponse


def visible_age(profile, viewer: User | None) -> tuple[int | None, bool]:
    """(ålder, age_hidden) som `viewer` får se (SCRUM-134): ingen ålder om personen har dolt den, utom för personen
    själv och moderatorer, som ser den och får veta att den är dold för andra."""
    age = calculate_age(profile.birth_date) if profile.birth_date else None
    if not profile.age_hidden:
        return age, False
    if viewer is not None and (viewer.is_moderator or viewer.id == profile.user_id):
        return age, True
    return None, False


def to_person_response(user: User, viewer: User | None = None) -> PersonResponse:
    """Personen som på ett personkort, som `viewer` ser den. Utan profil (kan finnas för gamla konton)
    blir allt utom användarnamnet tomt."""
    profile = user.profile
    if profile is None:
        return PersonResponse(
            id=user.id, username=user.username, name=None, age=None,
            municipality_name=None, district=None, image_url=None, interests=[],
        )
    age, age_hidden = visible_age(profile, viewer)
    return PersonResponse(
        id=user.id,
        username=user.username,
        name=profile.name,
        age=age,
        age_hidden=age_hidden,
        municipality_name=profile.municipality.name if profile.municipality else None,
        district=profile.district,
        image_url=storage.public_url(profile.profile_image_url) if profile.profile_image_url else None,
        interests=[ProfileInterest.model_validate(i) for i in sorted_interests(user)],
    )
