"""
Pydantic-scheman för User.

UserCreate är det som kommer in via POST /users/register - rått
lösenord i klartext (hashas i crud.user.create_user, aldrig här).

UserOut är det som går ut i svaret - innehåller ALDRIG password
eller password_hash.

Strikt scopat till ticketen "Skapa användarnamn och lösenord":
bara username + password. Varken email (egen ticket, mailbekräftelse
kommer senare) eller display_name (PO:s profile.py-beslut, se
crud/user.py) hanteras här.

OBS: display_name är fortfarande nullable=False i databasen, och
create_user() sätter den inte - kraschar alltså mot den riktiga
databasen tills PO:s profile.py-lösning är på plats. Förväntat,
inte ett fel i den här koden.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True
