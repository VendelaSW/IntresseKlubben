"""
Pydantic-scheman för User.

UserCreate är det som kommer in via POST /users/register - rått
lösenord i klartext (hashas i crud.user.create_user, aldrig här).

UserLogin är det som kommer in via POST /users/login - samma form
som UserCreate, men utan valideringskrav (vi bara kollar mot
befintliga uppgifter, skapar inget nytt).

UserOut är det som går ut i svaret - innehåller ALDRIG password
eller password_hash.

Strikt scopat till användarnamn + lösenord (registrering och
inloggning). Email hanteras i en egen ticket.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True
