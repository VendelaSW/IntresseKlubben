"""
Lösenord via e-post: återställa ett glömt lösenord, och byta lösenord med bekräftelse via mejl.

Båda ändrar lösenordet först när länken i mejlet används, och båda sätter User.password_changed_at, så att
inloggningar från innan bytet slutar gälla (se get_current_user). Länkarna går till sidor i frontend
(/aterstall och /bekrafta-losenord), som skickar koden hit, av samma skäl som bekräftelsen av e-post (se
email_verification.py).
"""

import logging

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.core.config import settings
from app.crud.email_token import (
    CONFIRM_PASSWORD_CHANGE,
    RESET_PASSWORD,
    TooManyEmails,
    check_rate_limit,
    create_token,
    expire_tokens,
    usable_token_user,
)
from app.models.email_token import utc_now
from app.models.user import User
from app.services.email import EmailFailed, get_email_sender
from app.services.email_message import build_message

logger = logging.getLogger(__name__)

RESET_SUBJECT = "Välj ett nytt lösenord"
CHANGE_SUBJECT = "Bekräfta ditt nya lösenord"


def send_reset_email(db: Session, user: User | None) -> None:
    """Skickar en länk för att välja ett nytt lösenord, om kontot finns och har e-post. Ger aldrig fel: svaret till
    den som frågar ska vara detsamma oavsett om kontot finns, så att det inte går att ta reda på vilka adresser
    som har konton. Ett mejl som skickades nyss, eller som inte gick att skicka, hoppas därför också över tyst."""
    if user is None or user.email is None:
        return
    try:
        check_rate_limit(db, user, RESET_PASSWORD)
        token = create_token(db, user, RESET_PASSWORD)
        text, body = build_message(
            user.username,
            "Någon har bett om att få välja ett nytt lösenord till ditt konto på Intresseklubben. "
            "Klicka på länken för att välja ett nytt.",
            "Välj nytt lösenord",
            f"{settings.frontend_base_url}/aterstall?token={token}",
            "Länken gäller i en timme och kan bara användas en gång. Har du inte bett om det här kan du strunta i "
            "mejlet: ditt lösenord är oförändrat.",
        )
        get_email_sender().send(user.email, RESET_SUBJECT, text, body)
    except TooManyEmails:
        logger.warning("Ingen återställningslänk till användare %s: en skickades nyss", user.id)
    except EmailFailed as err:
        logger.warning("Återställningslänken till användare %s gick inte att skicka: %s", user.id, err)


def request_password_change(db: Session, user: User, new_password: str) -> None:
    """Sparar det nya lösenordet (hashat) i en länk och skickar den till användarens e-post. Lösenordet byts först
    när länken används. Kastar TooManyEmails om ett mejl skickades nyss, och EmailFailed om det inte gick att
    skicka."""
    check_rate_limit(db, user, CONFIRM_PASSWORD_CHANGE)
    token = create_token(db, user, CONFIRM_PASSWORD_CHANGE, new_password_hash=hash_password(new_password))
    text, body = build_message(
        user.username,
        "Du har bett om att byta lösenord på Intresseklubben. Klicka på länken för att bekräfta. Fram till dess "
        "gäller ditt gamla lösenord.",
        "Bekräfta nytt lösenord",
        f"{settings.frontend_base_url}/bekrafta-losenord?token={token}",
        "Länken gäller i en timme och kan bara användas en gång. Har du inte bett om att byta lösenord bör du byta "
        "det själv: någon kan känna till ditt nuvarande.",
    )
    get_email_sender().send(user.email, CHANGE_SUBJECT, text, body)


def _set_password(db: Session, user: User, password_hash: str) -> None:
    """Byter lösenordet, loggar ut andra inloggningar och gör alla väntande lösenordslänkar ogiltiga. Sparar inte."""
    user.password_hash = password_hash
    user.password_changed_at = utc_now()
    expire_tokens(db, user.id, [RESET_PASSWORD, CONFIRM_PASSWORD_CHANGE])


def reset_password(db: Session, token: str, new_password: str) -> bool:
    """Byter lösenordet med en återställningslänk. False om länken är okänd, använd, har gått ut eller gäller en
    adress användaren inte har längre. Mejlet kom fram, så e-posten räknas som bekräftad."""
    found = usable_token_user(db, token, RESET_PASSWORD)
    if found is None:
        return False
    row, user = found
    row.used_at = utc_now()
    _set_password(db, user, hash_password(new_password))
    if user.email_verified_at is None:
        user.email_verified_at = utc_now()
    db.commit()
    return True


def confirm_password_change(db: Session, token: str) -> bool:
    """Byter till det nya lösenordet som väntade i länken. False om länken inte går att använda (se reset_password)."""
    found = usable_token_user(db, token, CONFIRM_PASSWORD_CHANGE)
    if found is None or not found[0].new_password_hash:
        return False
    row, user = found
    row.used_at = utc_now()
    _set_password(db, user, row.new_password_hash)
    row.new_password_hash = None  # behövs inte längre, och ska inte ligga kvar
    db.commit()
    return True
