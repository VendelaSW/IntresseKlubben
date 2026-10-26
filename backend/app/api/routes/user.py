"""
Registrerings- och inloggningsendpoints för User.

POST /users/register - tar emot UserCreate (username, email, password),
skapar en ny User via crud.user.create_user, returnerar UserOut. Skickar ett
mejl med en länk för att bekräfta e-posten; går det inte skapas kontot ändå.

POST /users/login - tar emot UserLogin (username_or_email, password):
användarnamn eller e-post i samma fält. Verifierar mot
get_user_by_username_or_email + verify_password, returnerar en
inloggningstoken och UserOut vid korrekta uppgifter. Ger ett generiskt
401-fel annars - avslöjar medvetet inte om det var användarnamnet,
e-posten eller lösenordet som var fel (standard säkerhetspraxis). Är
REQUIRE_EMAIL_VERIFICATION påslaget ger rätt uppgifter med obekräftad e-post
403 EMAIL_NOT_VERIFIED (av tills vidare).

GET /users/me - den inloggade användaren (kräver token), med sin egen e-post
(None för konton som skapades innan e-post krävdes) och om den är bekräftad.

POST /users/me/email-verification - skickar en ny bekräftelselänk till den
inloggades e-post ("Bekräfta din e-post" på profilen). 400 utan e-post eller
om den redan är bekräftad, 429 om ett mejl skickades nyss, 503 om mejlet inte
gick att skicka.

POST /users/verify-email - tar emot koden från länken (via frontendens sida
/verifiera) och bekräftar e-posten. Kräver ingen inloggning: länken ska fungera
även i en annan webbläsare. 400 om länken är okänd, använd eller har gått ut.

POST /users/forgot-password - "Glömt lösenord": skickar en länk för att välja
ett nytt lösenord till kontots e-post. Samma svar (204), och minst lika lång
svarstid, oavsett om kontot finns, så att det inte går att ta reda på vilka
konton som finns.

POST /users/reset-password - nytt lösenord med koden från länken (via sidan
/aterstall). Andra inloggningar slutar gälla. 400 om länken inte går att använda.

POST /users/me/password - byt lösenord: kräver det nuvarande (fel ger 403, som
PATCH ovan) och skickar en bekräftelselänk till e-posten. Det nya gäller först
när länken används; fram till dess gäller det gamla. 400 utan e-post, 429 om
ett mejl skickades nyss, 503 om mejlet inte gick att skicka.

POST /users/confirm-password-change - bekräftar bytet med koden från länken (via
sidan /bekrafta-losenord). Andra inloggningar slutar gälla. 400 om länken inte
går att använda.

GET /users/me/availability?username=&email= - om ett användarnamn och/eller en
e-post redan används av någon annan, för att formuläret ska kunna säga till
direkt medan man skriver. Svarar med samma meddelanden som PATCH nedan ger
(None = ledigt). Den egna användaren räknas inte. Kräver inloggning.

PATCH /users/me - ändrar användarnamn och/eller e-post (AccountUpdate), även
för att lägga till e-post på ett konto som saknar det. Samma regler som vid
registrering. Kräver lösenordet; fel lösenord ger 403, som DELETE nedan. 409
om användarnamnet eller e-posten redan används av någon annan. Man förblir
inloggad, eftersom token bygger på användarens id. En ny e-post är inte
bekräftad, och en bekräftelselänk skickas till den.

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

DELETE /users/{user_id}/dismiss - ångrar det, så att personen syns i Förslag
igen ("Ångra" direkt efter att man tagit bort någon). Idempotent.

GET /users/dismissed-suggestions - hur många personer du har tagit bort från
dina Förslag ({"count": 2}), så att "Visa dem igen" bara syns när det finns några.

DELETE /users/dismissed-suggestions - nollställer alla dina borttagna
förslag, så de kan dyka upp igen.
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.people import to_person_response
from app.auth.security import (
    create_access_token,
    get_current_user,
    require_profile,
    suspended_message,
    verify_password,
)
from app.core import error_messages as msg
from app.core import storage
from app.core.config import settings
from app.crud.email_token import TooManyEmails
from app.crud.contact import blocked_user_ids, is_blocked
from app.crud.moderation import suspended_user_ids
from app.crud.dismissed_suggestion import (
    count_dismissed_suggestions,
    dismiss_suggestion,
    undismiss_suggestion,
    list_dismissed_user_ids,
    reset_dismissed_suggestions,
)
from app.crud.interest import profile_interests, sorted_interests
from app.crud.profile import calculate_age, get_profile, list_people
from app.crud.user import (
    EmailTakenError,
    UsernameTakenError,
    create_user,
    delete_user,
    get_user_by_email,
    get_user_by_username,
    get_user_by_username_or_email,
    update_account,
)
from app.db.session import get_db
from app.models.profile import GenderEnum
from app.models.user import User
from app.schemas.profile import PersonResponse, PublicProfileResponse
from app.schemas.user import (
    AccountDelete,
    CurrentUserOut,
    AccountUpdate,
    AvailabilityOut,
    DismissedSuggestionsOut,
    ForgotPassword,
    LoginResponse,
    PasswordChange,
    ResetPassword,
    UserCreate,
    UserLogin,
    UserOut,
    VerifyEmail,
)
from app.services.email import EmailFailed
from app.services.email_verification import send_verification_email, try_send_verification_email, verify_email
from app.services.password_emails import (
    confirm_password_change,
    request_password_change,
    reset_password,
    send_reset_email,
)

from app.services.text_moderation import check_fields

router = APIRouter(prefix="/users", tags=["users"])


def _require_password(user: User, password: str) -> None:
    """Lösenordet krävs för att ändra eller radera kontot. Fel ger 403, inte
    401: frontend loggar ut vid 401, och ett felskrivet lösenord ska bara ge ett
    felmeddelande."""
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fel lösenord.")


USERNAME_TAKEN = "Användarnamnet är upptaget."
EMAIL_TAKEN = "E-postadressen används redan."


def _taken(exc: UsernameTakenError | EmailTakenError) -> HTTPException:
    """Samma 409-fel vid registrering och vid ändring av kontouppgifter."""
    detail = USERNAME_TAKEN if isinstance(exc, UsernameTakenError) else EMAIL_TAKEN
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    check_fields(username=user_in.username)
    try:
        user = create_user(db, user_in)
    except (UsernameTakenError, EmailTakenError) as exc:
        raise _taken(exc) from exc
    try_send_verification_email(db, user)
    return user


@router.post("/login", response_model=LoginResponse)
def login_user(credentials: UserLogin, db: Session = Depends(get_db)) -> LoginResponse:
    user = get_user_by_username_or_email(db, credentials.username_or_email)
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Fel användarnamn, e-post eller lösenord.",
        )
    # Först efter lösenordet, så att svaret inte avslöjar något om konton man inte har lösenordet till.
    if settings.require_email_verification and not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg.EMAIL_NOT_VERIFIED)
    suspended = suspended_message(db, user)
    if suspended is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=suspended)
    return LoginResponse(access_token=create_access_token(user.id), user=user)


@router.get("/me", response_model=CurrentUserOut)
def read_current_user(current_user: User = Depends(get_current_user)) -> CurrentUserOut:
    return current_user


@router.post("/me/email-verification", status_code=status.HTTP_204_NO_CONTENT)
def send_my_verification_email(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if current_user.email is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.EMAIL_MISSING)
    if current_user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.EMAIL_ALREADY_VERIFIED)
    try:
        send_verification_email(db, current_user)
    except TooManyEmails:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg.EMAIL_TOO_MANY_REQUESTS) from None
    except EmailFailed:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg.EMAIL_SEND_FAILED) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
def confirm_email(data: VerifyEmail, db: Session = Depends(get_db)) -> Response:
    if not verify_email(db, data.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.EMAIL_LINK_INVALID)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# "Glömt lösenord" tar alltid minst så här lång tid. Annars avslöjar svarstiden om kontot finns: med konto skapas en
# länk och ett mejl skickas (hundratals millisekunder), utan konto görs inget. Svaret skickas inte före mejlet (t.ex.
# med BackgroundTasks), eftersom Vercel kan pausa funktionen direkt efter svaret och mejlet då inte hinner iväg.
FORGOT_PASSWORD_MIN_SECONDS = 1.5


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(data: ForgotPassword, db: Session = Depends(get_db)) -> Response:
    started = time.monotonic()
    send_reset_email(db, get_user_by_username_or_email(db, data.username_or_email))
    remaining = FORGOT_PASSWORD_MIN_SECONDS - (time.monotonic() - started)
    if remaining > 0:
        time.sleep(remaining)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_forgotten_password(data: ResetPassword, db: Session = Depends(get_db)) -> Response:
    if not reset_password(db, data.token, data.new_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.PASSWORD_LINK_INVALID)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _require_password(current_user, data.current_password)
    if current_user.email is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.PASSWORD_CHANGE_NEEDS_EMAIL)
    try:
        request_password_change(db, current_user, data.new_password)
    except TooManyEmails:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg.EMAIL_TOO_MANY_REQUESTS) from None
    except EmailFailed:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg.EMAIL_SEND_FAILED) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/confirm-password-change", status_code=status.HTTP_204_NO_CONTENT)
def confirm_my_password_change(data: VerifyEmail, db: Session = Depends(get_db)) -> Response:
    if not confirm_password_change(db, data.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg.PASSWORD_LINK_INVALID)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/availability", response_model=AvailabilityOut)
def check_availability(
    username: str | None = Query(None, max_length=100),
    email: str | None = Query(None, max_length=320),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailabilityOut:
    def taken_by_other(found: User | None) -> bool:
        return found is not None and found.id != current_user.id

    return AvailabilityOut(
        username=USERNAME_TAKEN if username and taken_by_other(get_user_by_username(db, username.strip())) else None,
        email=EMAIL_TAKEN if email and taken_by_other(get_user_by_email(db, email.strip())) else None,
    )


@router.patch("/me", response_model=CurrentUserOut)
def update_my_account(
    data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserOut:
    _require_password(current_user, data.password)
    check_fields(username=data.username)
    old_email = current_user.email
    try:
        user = update_account(db, current_user, username=data.username, email=data.email)
    except (UsernameTakenError, EmailTakenError) as exc:
        raise _taken(exc) from exc
    if user.email != old_email:
        try_send_verification_email(db, user)
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _require_password(current_user, data.password)
    image_key = delete_user(db, current_user)
    # Efter att raderingen sparats: misslyckas bilden är kontot ändå borta, och
    # delete_object ger aldrig fel för en bild som inte går att ta bort.
    if image_key and storage.is_configured():
        storage.delete_object(image_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Personer, förslag och andras profiler är låsta tills ens egen profil är klar
# (se require_profile). /users/me och inloggningen är öppna.
@router.get(
    "/",
    response_model=list[PersonResponse],
    dependencies=[Depends(require_profile)],
)
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
    hidden_ids = (
        list_dismissed_user_ids(db, current_user.id)
        | blocked_user_ids(db, current_user.id)
        | suspended_user_ids(db)
    )
    profiles = list_people(
        db, current_user.id, interest_id, municipality_code, hidden_ids,
        gender=gender, min_age=min_age, max_age=max_age,
    )
    return [to_person_response(p.user) for p in profiles]


@router.post(
    "/{user_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_profile)],
)
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


@router.delete(
    "/{user_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_profile)],
)
def undismiss_person(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    undismiss_suggestion(db, current_user.id, user_id)


@router.get(
    "/dismissed-suggestions",
    response_model=DismissedSuggestionsOut,
    dependencies=[Depends(require_profile)],
)
def read_dismissed_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DismissedSuggestionsOut:
    return DismissedSuggestionsOut(count=count_dismissed_suggestions(db, current_user.id))


@router.delete(
    "/dismissed-suggestions",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_profile)],
)
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
        interests=profile_interests(sorted_interests(profile.user)),
    )


@router.get(
    "/{user_id}/profile",
    response_model=PublicProfileResponse,
    dependencies=[Depends(require_profile)],
)
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
