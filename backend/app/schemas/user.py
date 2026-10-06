"""
Pydantic-scheman för User.

UserCreate är det som kommer in via POST /users/register - användarnamn,
e-postadress och rått lösenord i klartext (hashas i
crud.user.create_user, aldrig här). E-posten krävs för att man senare ska
kunna återställa lösenordet, och sparas alltid med små bokstäver.

UserLogin är det som kommer in via POST /users/login - samma form
som UserCreate, men utan valideringskrav (vi bara kollar mot
befintliga uppgifter, skapar inget nytt).

UserOut är det som går ut i svaret - innehåller ALDRIG password,
password_hash eller email (e-post är privat, se AGENTS.md).

CurrentUserOut är UserOut plus ens egen e-post, och används bara för
GET /users/me och PUT /users/me/email - alltså bara till användaren själv.

EmailUpdate är det som kommer in via PUT /users/me/email, för konton som
skapades innan e-post krävdes vid registrering.
"""

from datetime import datetime

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, field_validator


def normalize_email(v: str) -> str:
    """Kontrollerar och normaliserar en e-postadress. Delas av registreringen
    och PUT /users/me/email, så att samma regler gäller överallt."""
    # email-validator (samma som pydantics EmailStr använder) men med eget
    # svenskt felmeddelande. Bara formen kontrolleras, ingen DNS-uppslagning.
    try:
        validated = validate_email(v.strip(), check_deliverability=False)
    except EmailNotValidError:
        raise ValueError("Ogiltig e-postadress")
    # Små bokstäver, så att "Emmy@x.se" och "emmy@x.se" är samma adress.
    return validated.normalized.lower()


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def email_is_valid(cls, v: str) -> str:
        return normalize_email(v)


class EmailUpdate(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_is_valid(cls, v: str) -> str:
        return normalize_email(v)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class CurrentUserOut(UserOut):
    """Den inloggade användaren om sig själv. email är None för konton som
    skapades innan e-post krävdes."""

    email: str | None


class LoginResponse(BaseModel):
    """Svar från POST /users/login. access_token skickas sedan med som
    "Authorization: Bearer <access_token>" i anrop som kräver inloggning."""

    access_token: str
    token_type: str = "bearer"
    user: UserOut
