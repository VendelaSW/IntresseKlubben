"""
Registrerings- och inloggningsendpoints för User.

POST /users/register - tar emot UserCreate (username, password),
skapar en ny User via crud.user.create_user, returnerar UserOut.

POST /users/login - tar emot UserLogin (username, password),
verifierar mot get_user_by_username + verify_password, returnerar
en inloggningstoken och UserOut vid korrekta uppgifter. Ger ett
generiskt 401-fel annars - avslöjar medvetet inte om det var
användarnamnet eller lösenordet som var fel (standard säkerhetspraxis).

GET /users/me - den inloggade användaren (kräver token).

GET /users/ - andra användare med sparad profil, valfritt filtrerade på
?interest_id= och/eller ?municipality_code=. Utesluter dig själv. Samma
dataminimering som PublicProfileResponse, men med username (länk till
/anvandare/{username}) och interests (taggar/matchning) - se PersonResponse.

GET /users/{username}/profile - visar en annan användares profil
via användarnamn (inte id, så adressen går att dela/komma ihåg),
skrivskyddat. Kräver inloggning, precis som resten av profil- och
intresse-anropen. Använder ett eget, mindre svar (PublicProfileResponse):
bara namn, ålder, kommun, stadsdel och bild - aldrig födelsedatum, kön,
användarnamn eller e-post.

POST /users/{username}/dismiss - tar bort en person från dina Förslag
(GET /users/ ovan). Ensidigt, påverkar inget annat. Idempotent.

DELETE /users/dismissed-suggestions - nollställer alla dina borttagna
förslag, så de kan dyka upp igen.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, get_current_user, verify_password
from app.core import storage
from app.crud.dismissed_suggestion import (
    dismiss_suggestion,
    list_dismissed_user_ids,
    reset_dismissed_suggestions,
)
from app.crud.interest import sorted_interests
from app.crud.profile import calculate_age, get_profile, list_people
from app.crud.user import UsernameTakenError, create_user, get_user_by_username
from app.db.session import get_db
from app.models.user import User
from app.schemas.interest import InterestResponse
from app.schemas.profile import PersonResponse, PublicProfileResponse
from app.schemas.user import LoginResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    try:
        return create_user(db, user_in)
    except UsernameTakenError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Användarnamnet är upptaget.",
        )


@router.post("/login", response_model=LoginResponse)
def login_user(credentials: UserLogin, db: Session = Depends(get_db)) -> LoginResponse:
    user = get_user_by_username(db, credentials.username)
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Fel användarnamn eller lösenord.",
        )
    return LoginResponse(access_token=create_access_token(user.id), user=user)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user


def _to_person_response(profile) -> PersonResponse:
    return PersonResponse(
        username=profile.user.username,
        name=profile.name,
        age=calculate_age(profile.birth_date) if profile.birth_date else None,
        municipality_name=profile.municipality.name if profile.municipality else None,
        district=profile.district,
        image_url=storage.public_url(profile.profile_image_url) if profile.profile_image_url else None,
        interests=[InterestResponse.model_validate(i) for i in sorted_interests(profile.user)],
    )


@router.get("/", response_model=list[PersonResponse])
def read_people(
    interest_id: int | None = None,
    municipality_code: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PersonResponse]:
    dismissed_ids = list_dismissed_user_ids(db, current_user.id)
    profiles = list_people(db, current_user.id, interest_id, municipality_code, dismissed_ids)
    return [_to_person_response(p) for p in profiles]


@router.post("/{username}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_person(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    other = get_user_by_username(db, username)
    if other is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Användaren finns inte")
    if other.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du kan inte ta bort dig själv som förslag.",
        )
    dismiss_suggestion(db, current_user.id, other.id)


@router.delete("/dismissed-suggestions", status_code=status.HTTP_204_NO_CONTENT)
def reset_suggestions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    reset_dismissed_suggestions(db, current_user.id)


def _to_public_response(profile) -> PublicProfileResponse:
    return PublicProfileResponse(
        name=profile.name,
        age=calculate_age(profile.birth_date) if profile.birth_date else None,
        municipality_name=profile.municipality.name if profile.municipality else None,
        district=profile.district,
        image_url=storage.public_url(profile.profile_image_url) if profile.profile_image_url else None,
    )


@router.get("/{username}/profile", response_model=PublicProfileResponse)
def read_user_profile(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PublicProfileResponse:
    user = get_user_by_username(db, username)
    profile = get_profile(db, user.id) if user else None
    if profile is None:
        raise HTTPException(status_code=404, detail="Ingen profil hittad")
    return _to_public_response(profile)
