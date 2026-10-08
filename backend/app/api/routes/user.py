"""
Registrerings- och inloggningsendpoints för User.

POST /users/register - tar emot UserCreate (username, email, password),
skapar en ny User via crud.user.create_user, returnerar UserOut.

POST /users/login - tar emot UserLogin (username, password),
verifierar mot get_user_by_username + verify_password, returnerar
en inloggningstoken och UserOut vid korrekta uppgifter. Ger ett
generiskt 401-fel annars - avslöjar medvetet inte om det var
användarnamnet eller lösenordet som var fel (standard säkerhetspraxis).

GET /users/me - den inloggade användaren (kräver token), med sin egen e-post
(None för konton som skapades innan e-post krävdes).

PUT /users/me/email - lägger till e-post för ett konto som saknar det. Samma
regler som vid registrering. 409 om adressen redan används eller om kontot
redan har en e-post (den går inte att ändra här).

DELETE /users/me - raderar kontot och allt som hör till det (se
crud.user.delete_user). Kräver lösenordet i AccountDelete. Fel lösenord ger
403, inte 401: frontend loggar ut vid 401, och ett felskrivet lösenord ska
bara ge ett felmeddelande.

GET /users/ - andra användare med sparad profil, valfritt filtrerade på
?interest_id=, ?municipality_code=, ?gender= och ?min_age=/?max_age= (0-120,
400 om min_age är större än max_age). ?gender= ger bara dem som själva valt att
gå att hitta på kön (gender_searchable), så att filtret inte avslöjar könet
hos alla andra. Utesluter dig själv, dina
borttagna förslag och alla som har blockerat dig eller som du har blockerat. Samma
dataminimering som PublicProfileResponse, men med id (länk till
/anvandare/{id}) och interests (taggar/matchning) - se PersonResponse.

GET /users/{user_id}/profile - visar en annan användares profil,
skrivskyddat. Via id, aldrig användarnamn: användarnamn ska inte synas i
några adresser. Ger samma 404 som för en profil som inte finns om någon av er
har blockerat den andra. Kräver inloggning, precis som resten av profil- och
intresse-anropen. Använder ett eget, mindre svar (PublicProfileResponse):
bara namn, ålder, kommun, stadsdel och bild - aldrig födelsedatum, kön,
användarnamn eller e-post.

POST /users/{user_id}/dismiss - tar bort en person från dina Förslag
(GET /users/ ovan). Ensidigt, påverkar inget annat. Idempotent.

DELETE /users/dismissed-suggestions - nollställer alla dina borttagna
förslag, så de kan dyka upp igen.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, get_current_user, verify_password
from app.core import storage
from app.crud.contact import blocked_user_ids, is_blocked
from app.crud.dismissed_suggestion import (
    dismiss_suggestion,
    list_dismissed_user_ids,
    reset_dismissed_suggestions,
)
from app.crud.interest import sorted_interests
from app.crud.profile import calculate_age, get_profile, list_people
from app.crud.user import (
    EmailAlreadySetError,
    EmailTakenError,
    UsernameTakenError,
    create_user,
    delete_user,
    get_user_by_username,
    set_email,
)
from app.db.session import get_db
from app.models.profile import GenderEnum
from app.models.user import User
from app.schemas.interest import InterestResponse
from app.schemas.profile import PersonResponse, PublicProfileResponse
from app.schemas.user import (
    AccountDelete,
    CurrentUserOut,
    EmailUpdate,
    LoginResponse,
    UserCreate,
    UserLogin,
    UserOut,
)

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
    except EmailTakenError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-postadressen används redan.",
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


@router.get("/me", response_model=CurrentUserOut)
def read_current_user(current_user: User = Depends(get_current_user)) -> CurrentUserOut:
    return current_user


@router.put("/me/email", response_model=CurrentUserOut)
def add_email(
    email_in: EmailUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserOut:
    try:
        return set_email(db, current_user, email_in.email)
    except EmailAlreadySetError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Du har redan en e-postadress.",
        )
    except EmailTakenError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-postadressen används redan.",
        )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fel lösenord.")
    image_key = delete_user(db, current_user)
    # Efter att raderingen sparats: misslyckas bilden är kontot ändå borta, och
    # delete_object ger aldrig fel för en bild som inte går att ta bort.
    if image_key and storage.is_configured():
        storage.delete_object(image_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_person_response(profile) -> PersonResponse:
    return PersonResponse(
        id=profile.user.id,
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
    gender: GenderEnum | None = None,
    min_age: int | None = Query(None, ge=0, le=120),
    max_age: int | None = Query(None, ge=0, le=120),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PersonResponse]:
    if min_age is not None and max_age is not None and min_age > max_age:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lägsta åldern kan inte vara högre än den högsta.",
        )
    hidden_ids = list_dismissed_user_ids(db, current_user.id) | blocked_user_ids(db, current_user.id)
    profiles = list_people(
        db, current_user.id, interest_id, municipality_code, hidden_ids,
        gender=gender, min_age=min_age, max_age=max_age,
    )
    return [_to_person_response(p) for p in profiles]


@router.post("/{user_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_person(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    other = db.get(User, user_id)
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
        profile_text=profile.profile_text,
        interests=[InterestResponse.model_validate(i) for i in sorted_interests(profile.user)],
    )


@router.get("/{user_id}/profile", response_model=PublicProfileResponse)
def read_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PublicProfileResponse:
    user = db.get(User, user_id)
    # Samma neutrala 404 som för en profil som inte finns, så att en blockering
    # aldrig avslöjas (se AGENTS.md).
    if user is not None and is_blocked(db, current_user.id, user.id):
        user = None
    profile = get_profile(db, user.id) if user else None
    if profile is None:
        raise HTTPException(status_code=404, detail="Ingen profil hittad")
    return _to_public_response(profile)
