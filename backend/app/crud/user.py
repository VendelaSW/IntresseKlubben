"""
Databasoperationer för User.

get_user_by_username är det delade gränssnittet mot inloggningen
("Logga in med användarnamn och lösenord"-ticketen) - se PO:s
exempel: den ticketen kan byggas mot exakt den här signaturen utan
att vänta på resten av registreringsflödet.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate


class UsernameTakenError(Exception):
    """Användarnamnet är redan taget av en annan användare."""


def get_user_by_username(db: Session, username: str) -> User | None:
    """
    Hämtar en User baserat på username, eller None om den inte finns.

    Case-insensitive: "Vendela" och "vendela" är samma användare, så
    login, profiluppslag och username-kontrollen i create_user nedan
    (alla går via den här funktionen) behandlar dem lika. Username
    sparas med den stavning/skiftläge användaren registrerade sig med
    - vi normaliserar bara jämförelsen, inte lagringen.

    Kastar inget undantag om användaren saknas - anroparen (t.ex.
    login-flödet) avgör själv hur ett None-resultat ska hanteras
    (typiskt: "fel användarnamn").
    """
    return db.query(User).filter(func.lower(User.username) == username.lower()).first()


def create_user(db: Session, user_in: UserCreate) -> User:
    """
    Skapar en ny User från ett UserCreate-schema.

    Kollar proaktivt om username redan finns innan insert, så
    routen kan ge ett tydligt fel istället för en rå
    databas-krasch. (Det ger en liten race condition om två
    registreringar med samma username kommer in samtidigt - inget
    vi behöver bry oss om i det här projektet.)

    Lösenordet hashas här - user_in.password i klartext sparas
    aldrig.

    Scopat till username + password (se schemas/user.py). Sätter
    varken email (egen ticket) eller display_name (PO:s
    profile.py-beslut) - kraschar därför mot NOT NULL-constraintet
    på display_name tills PO:s lösning är på plats. Förväntat just
    nu, inte en bugg.
    """
    if get_user_by_username(db, user_in.username) is not None:
        raise UsernameTakenError(user_in.username)

    user = User(
        username=user_in.username,
        password_hash=hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
