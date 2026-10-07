"""
Databasoperationer för User.

get_user_by_username är det delade gränssnittet mot inloggningen
("Logga in med användarnamn och lösenord"-ticketen) - se PO:s
exempel: den ticketen kan byggas mot exakt den här signaturen utan
att vänta på resten av registreringsflödet.
"""

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.crud.group import list_user_groups, remove_member
from app.models.contact import Contact
from app.models.dismissed_suggestion import DismissedSuggestion
from app.models.event import Event, EventInvitation, EventResponse
from app.models.message import Message
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


def _commit_or_raise_taken(db: Session, username: str | None, email: str | None) -> None:
    """
    Sparar, men gör om en krock med en annan användare till samma fel som
    kontrollerna före sparandet ger.

    Kontrollerna i create_user och set_email hinner inte alltid: sparar två
    personer samma användarnamn eller e-post exakt samtidigt hittar ingen av
    dem den andra, och databasen (unika index) stoppar den som kommer sist.
    Utan det här skulle det bli ett serverfel (500) i stället för 409.
    """
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if username is not None and get_user_by_username(db, username) is not None:
            raise UsernameTakenError(username) from None
        if email is not None and get_user_by_email(db, email) is not None:
            raise EmailTakenError(email) from None
        raise


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
    _commit_or_raise_taken(db, username=None, email=email)
    db.refresh(user)
    return user


def create_user(db: Session, user_in: UserCreate) -> User:
    """
    Skapar en ny User från ett UserCreate-schema.

    Kollar proaktivt om username och e-post redan finns innan insert, så
    routen kan ge ett tydligt fel istället för en rå
    databas-krasch. Kommer två registreringar med samma username eller
    e-post exakt samtidigt stoppar databasen den andra, och det ger samma
    fel (se _commit_or_raise_taken).

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
    _commit_or_raise_taken(db, username=user_in.username, email=user_in.email)
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> str | None:
    """
    Raderar kontot och allt som hör till det, sparat på en gång.

    - Klubbar: användaren går ur alla. Äger hen en klubb tar den som varit med
      längst över, och en klubb som blir tom raderas (samma regler som när
      man går ur själv).
    - Egna events raderas med sina inbjudningar och svar, liksom användarens
      inbjudningar och svar på andras events.
    - Meddelanden, kontakter, blockeringar och borttagna förslag raderas åt
      båda hållen, så att inget pekar på kontot efteråt.
    - Profil, intressen och sist själva kontot.

    Allt raderas uttryckligen här i stället för att lita på databasens
    ON DELETE, så att det fungerar likadant i testerna (SQLite) och i Neon.
    Returnerar profilbildens nyckel i bucketen (eller None), så att routen kan
    ta bort bilden när raderingen har sparats.
    """
    user_id = user.id

    for group in list_user_groups(db, user_id):
        remove_member(db, group, user_id)

    # Egna events via ORM, så att deras inbjudningar och svar följer med.
    for event in db.query(Event).filter(Event.created_by == user_id).all():
        db.delete(event)
    # Skriv medlemskapen och eventen till databasen innan kontot raderas.
    # GroupMember har ingen relation till User, så annars vet SQLAlchemy inte
    # att de måste bort först, och i Neon (som kontrollerar främmande nycklar)
    # kan kontot hinna raderas före dem.
    db.flush()
    db.query(EventInvitation).filter(EventInvitation.user_id == user_id).delete(synchronize_session=False)
    db.query(EventResponse).filter(EventResponse.user_id == user_id).delete(synchronize_session=False)

    db.query(Message).filter(
        or_(Message.sender_id == user_id, Message.recipient_id == user_id)
    ).delete(synchronize_session=False)
    db.query(Contact).filter(
        or_(Contact.requester_id == user_id, Contact.addressee_id == user_id)
    ).delete(synchronize_session=False)
    db.query(DismissedSuggestion).filter(
        or_(DismissedSuggestion.user_id == user_id, DismissedSuggestion.dismissed_user_id == user_id)
    ).delete(synchronize_session=False)

    image_key = user.profile.profile_image_url if user.profile else None
    if user.profile is not None:
        db.delete(user.profile)
    user.interests.clear()
    db.delete(user)
    db.commit()
    return image_key
