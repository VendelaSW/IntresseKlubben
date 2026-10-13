"""
Pydantic-scheman för User.

UserCreate är det som kommer in via POST /users/register - användarnamn,
e-postadress och rått lösenord i klartext (hashas i
crud.user.create_user, aldrig här). E-posten krävs för att man senare ska
kunna återställa lösenordet, och sparas alltid med små bokstäver.

UserLogin är det som kommer in via POST /users/login - användarnamn ELLER
e-post i samma fält, och lösenordet. Utan valideringskrav (vi bara kollar mot
befintliga uppgifter, skapar inget nytt). Ett användarnamn får därför inte
innehålla @, så att det aldrig kan förväxlas med en e-postadress.

UserOut är det som går ut i svaret - innehåller ALDRIG password,
password_hash eller email (e-post är privat, se AGENTS.md).

CurrentUserOut är UserOut plus ens egen e-post och om profilen är klar, och
används bara för GET /users/me, PATCH /users/me och inloggningssvaret - alltså
bara till användaren själv.

AccountUpdate är det som kommer in via PATCH /users/me: nytt användarnamn
och/eller ny e-post, med samma regler som vid registrering, plus det
nuvarande lösenordet. Används också av konton som skapades innan e-post
krävdes, för att lägga till en.
"""

from datetime import datetime

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.profanity import validate_clean_text


def normalize_email(v: str) -> str:
    """Kontrollerar och normaliserar en e-postadress. Delas av registreringen
    och PATCH /users/me, så att samma regler gäller överallt."""
    # email-validator (samma som pydantics EmailStr använder) men med eget
    # svenskt felmeddelande. Bara formen kontrolleras, ingen DNS-uppslagning.
    try:
        validated = validate_email(v.strip(), check_deliverability=False)
    except EmailNotValidError:
        raise ValueError("Ogiltig e-postadress")
    # Små bokstäver, så att "Emmy@x.se" och "emmy@x.se" är samma adress.
    return validated.normalized.lower()


def validate_username(value: str) -> str:
    """Reglerna för ett användarnamn (utöver längden, som sätts med Field).
    Delas av registreringen och PATCH /users/me."""
    validate_clean_text(value, "Användarnamnet")
    # Inloggningen tolkar allt med @ som en e-postadress (se UserLogin).
    if "@" in value:
        raise ValueError("Användarnamnet får inte innehålla @")
    return value


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str
    password: str = Field(min_length=8)

    @field_validator("username")
    @classmethod
    def username_is_valid(cls, value: str) -> str:
        return validate_username(value)

    @field_validator("email")
    @classmethod
    def email_is_valid(cls, v: str) -> str:
        return normalize_email(v)


class AccountUpdate(BaseModel):
    """Ändra användarnamn och/eller e-post. Lösenordet krävs, som när man
    raderar kontot, så att en inloggad dator som någon annan sitter vid inte
    räcker. Fält som inte skickas med lämnas som de är."""

    password: str
    username: str | None = Field(None, min_length=3, max_length=50)
    email: str | None = None

    @field_validator("username")
    @classmethod
    def username_is_valid(cls, value: str | None) -> str | None:
        return None if value is None else validate_username(value)

    @field_validator("email")
    @classmethod
    def email_is_valid(cls, v: str | None) -> str | None:
        return None if v is None else normalize_email(v)

    @model_validator(mode="after")
    def something_to_change(self):
        if self.username is None and self.email is None:
            raise ValueError("Ange ett nytt användarnamn eller en ny e-postadress")
        return self


class AvailabilityOut(BaseModel):
    """Svar från GET /users/me/availability: meddelandet om användarnamnet
    eller e-posten redan används av någon annan, annars None."""

    username: str | None
    email: str | None


class UserLogin(BaseModel):
    username_or_email: str
    password: str


class AccountDelete(BaseModel):
    """Lösenordet krävs för att radera kontot, så att en inloggad dator som
    någon annan sitter vid inte räcker."""

    password: str


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class CurrentUserOut(UserOut):
    """Den inloggade användaren om sig själv. email är None för konton som
    skapades innan e-post krävdes. profile_completed säger om profilen är klar;
    tills dess skickar frontend en till "Skapa din profil" (se User.profile_completed).
    Används också i inloggningssvaret, som bara går till användaren själv."""

    email: str | None
    profile_completed: bool


class LoginResponse(BaseModel):
    """Svar från POST /users/login. access_token skickas sedan med som
    "Authorization: Bearer <access_token>" i anrop som kräver inloggning."""

    access_token: str
    token_type: str = "bearer"
    user: CurrentUserOut
