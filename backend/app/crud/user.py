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


class EmailTakenError(Exception):
    """E-postadressen används redan av en annan användare."""


class EmailAlreadySetError(Exception):
    """Användaren har redan en e-postadress. Den går inte att ändra här."""


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


def get_user_by_email(db: Session, email: str) -> User | None:
    """Hämtar en User baserat på e-postadress (skiftlägesokänsligt), eller None."""
    return db.query(User).filter(func.lower(User.email) == email.lower()).first()


def set_email(db: Session, user: User, email: str) -> User:
    """
    Lägger till e-post för ett konto som skapades innan e-post krävdes.

    email kommer redan kontrollerad och med små bokstäver från EmailUpdate
    (se schemas/user.py). Går bara att göra en gång: att byta en befintlig
    adress är ett eget ärende (bör t.ex. kräva lösenordet).
    """
    if user.email is not None:
        raise EmailAlreadySetError()
    other = get_user_by_email(db, email)
    if other is not None and other.id != user.id:
        raise EmailTakenError(email)

    user.email = email
    db.commit()
    db.refresh(user)
    return user


def create_user(db: Session, user_in: UserCreate) -> User:
    """
    Skapar en ny User från ett UserCreate-schema.

    Kollar proaktivt om username och e-post redan finns innan insert, så
    routen kan ge ett tydligt fel istället för en rå
    databas-krasch. (Det ger en liten race condition om två
    registreringar med samma username eller e-post kommer in samtidigt -
    inget vi behöver bry oss om i det här projektet.)

    Lösenordet hashas här - user_in.password i klartext sparas
    aldrig.

    E-posten kommer redan med små bokstäver från UserCreate (se
    schemas/user.py), så den unika kolumnen räcker för att "Emmy@x.se" och
    "emmy@x.se" inte ska kunna bli två konton.
    """
    if get_user_by_username(db, user_in.username) is not None:
        raise UsernameTakenError(user_in.username)
    if get_user_by_email(db, user_in.email) is not None:
        raise EmailTakenError(user_in.email)

    user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
