"""Hur en annan användare visas i listor: personkorten på Personer
(GET /users/) och kontakterna och förfrågningarna (GET /contacts).

Bara det som syns på ett personkort: namn, ålder (aldrig födelsedatum),
kommun, stadsdel, bild och intressen. Aldrig e-post, kön eller annat privat
(se AGENTS.md, "Other users' data").
"""

from sqlalchemy.orm import Session

from app.core import storage
from app.crud.interest import profile_interests
from app.crud.profile import calculate_age
from app.models.user import User
from app.schemas.profile import PersonResponse


def to_person_response(db: Session, user: User) -> PersonResponse:
    """Personen som på ett personkort. Utan profil (kan finnas för gamla konton)
    blir allt utom användarnamnet tomt."""
    profile = user.profile
    if profile is None:
        return PersonResponse(
            id=user.id, username=user.username, name=None, age=None,
            municipality_name=None, district=None, image_url=None, interests=[],
        )
    return PersonResponse(
        id=user.id,
        username=user.username,
        name=profile.name,
        age=calculate_age(profile.birth_date) if profile.birth_date else None,
        municipality_name=profile.municipality.name if profile.municipality else None,
        district=profile.district,
        image_url=storage.public_url(profile.profile_image_url) if profile.profile_image_url else None,
        interests=profile_interests(db, user),
    )
