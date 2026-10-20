"""
Bekräftelse av e-postadressen: mejlet med länken, och att länken används.

Länken går till frontendens sida /verifiera, som skickar koden till POST /users/verify-email. Den går aldrig direkt
till backend: e-postprogram öppnar ofta länkar i förväg för att leta efter skadlig kod, och då skulle de förbruka
länken innan användaren hunnit klicka.
"""

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.crud.email_token import VERIFY_EMAIL, TooManyEmails, check_rate_limit, create_token, find_token, is_usable
from app.models.email_token import utc_now
from app.models.user import User
from app.services.email import EmailFailed, get_email_sender
from app.services.email_message import build_message

logger = logging.getLogger(__name__)

SUBJECT = "Bekräfta din e-postadress"


def _message(user: User, link: str) -> tuple[str, str]:
    return build_message(
        user.username,
        f"Klicka på länken för att bekräfta att {user.email} är din e-postadress på Intresseklubben.",
        "Bekräfta e-postadressen",
        link,
        "Länken gäller i 24 timmar. Har du inte skapat ett konto hos oss kan du strunta i det här mejlet.",
    )


def send_verification_email(db: Session, user: User) -> None:
    """Skickar en ny bekräftelselänk till användarens e-post. Kastar TooManyEmails om ett mejl skickades nyss, och
    EmailFailed om det inte gick att skicka. Spärren gäller alla utskick, även när e-posten byts, så att ingen kan
    byta adress om och om igen för att skicka mejl till andra från vår domän."""
    check_rate_limit(db, user, VERIFY_EMAIL)
    token = create_token(db, user, VERIFY_EMAIL)
    text, body = _message(user, f"{settings.frontend_base_url}/verifiera?token={token}")
    get_email_sender().send(user.email, SUBJECT, text, body)


def try_send_verification_email(db: Session, user: User) -> None:
    """Som send_verification_email, men inget stoppar anropet: kontot eller den nya e-posten sparas ändå, och man
    kan skicka en ny länk från profilen. Används när kontot skapas och när e-posten byts."""
    try:
        send_verification_email(db, user)
    except TooManyEmails:
        logger.warning("Inget bekräftelsemejl till användare %s: ett skickades nyss", user.id)
    except EmailFailed as err:
        logger.warning("Bekräftelsemejlet till användare %s gick inte att skicka: %s", user.id, err)


def verify_email(db: Session, token: str) -> bool:
    """Bekräftar e-posten som länken skickades till. False om länken är okänd, använd, har gått ut eller gäller en
    adress som användaren inte har längre. En redan bekräftad adress ger True även om länken använts (t.ex. om man
    klickar två gånger)."""
    row = find_token(db, token, VERIFY_EMAIL)
    if row is None:
        return False
    user = db.get(User, row.user_id)
    if user is None or user.email is None or (row.email or "").lower() != user.email.lower():
        return False
    if user.email_verified_at is not None:
        return True
    if not is_usable(row):
        return False
    now = utc_now()
    row.used_at = now
    user.email_verified_at = now
    db.commit()
    return True
