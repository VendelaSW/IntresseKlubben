"""
Engångslänkar i mejl (EmailToken).

Koden i länken är slumpad (secrets.token_urlsafe) och bara dess SHA-256 sparas. En långsam hash som bcrypt behövs
inte: koden är slumpad och lång, inte ett lösenord någon har hittat på, och den måste gå att slå upp.

En ny länk gör tidigare oanvända länkar av samma sort ogiltiga, så att bara den senaste i inkorgen fungerar.
Spärren mot för många mejl räknar raderna i databasen och inte i minnet, så att den gäller över alla serverinstanser
(Vercel startar flera).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.email_token import EmailToken, utc_now
from app.models.user import User

VERIFY_EMAIL = "verify_email"
RESET_PASSWORD = "reset_password"
CONFIRM_PASSWORD_CHANGE = "confirm_password_change"

# Hur länge en länk gäller. Länkar som ändrar lösenordet gäller kort tid.
LIFETIMES = {
    VERIFY_EMAIL: timedelta(hours=24),
    RESET_PASSWORD: timedelta(hours=1),
    CONFIRM_PASSWORD_CHANGE: timedelta(hours=1),
}

# Spärren: minst så här länge mellan två mejl av samma sort, och högst så här många per timme.
MIN_INTERVAL = timedelta(seconds=60)
MAX_PER_HOUR = 5


class TooManyEmails(Exception):
    """Ett mejl av samma sort skickades nyss, eller för många den senaste timmen."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utc(moment: datetime) -> datetime:
    """SQLite sparar tider utan tidszon. De sparas alltid i UTC, så de får tillbaka den här."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=timezone.utc)


def check_rate_limit(db: Session, user: User, purpose: str) -> None:
    """Kastar TooManyEmails om användaren inte får ett nytt mejl av den här sorten än."""
    now = utc_now()
    recent = [
        _utc(created)
        for (created,) in db.query(EmailToken.created_at).filter(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.created_at > now - timedelta(hours=1),
        )
    ]
    if len(recent) >= MAX_PER_HOUR or any(now - created < MIN_INTERVAL for created in recent):
        raise TooManyEmails()


def expire_tokens(db: Session, user_id: int, purposes: list[str]) -> None:
    """Gör användarens oanvända länkar av de här sorterna ogiltiga. Sparar inte."""
    now = utc_now()
    db.query(EmailToken).filter(
        EmailToken.user_id == user_id,
        EmailToken.purpose.in_(purposes),
        EmailToken.used_at.is_(None),
        EmailToken.expires_at > now,
    ).update({EmailToken.expires_at: now}, synchronize_session=False)


def create_token(db: Session, user: User, purpose: str, new_password_hash: str | None = None) -> str:
    """Skapar en ny länk för `purpose` till användarens nuvarande e-post och ger koden som ska stå i länken.
    Tidigare oanvända länkar av samma sort slutar gälla. `new_password_hash` är det nya lösenordet för
    CONFIRM_PASSWORD_CHANGE. Sparar."""
    now = utc_now()
    expire_tokens(db, user.id, [purpose])
    token = secrets.token_urlsafe(32)
    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=_hash(token),
            email=user.email,
            new_password_hash=new_password_hash,
            created_at=now,
            expires_at=now + LIFETIMES[purpose],
        )
    )
    db.commit()
    return token


def find_token(db: Session, token: str, purpose: str) -> EmailToken | None:
    """Raden för koden, om den finns och är av rätt sort. Kontrollerar inte om den har gått ut eller använts."""
    return (
        db.query(EmailToken)
        .filter(EmailToken.token_hash == _hash(token), EmailToken.purpose == purpose)
        .one_or_none()
    )


def is_usable(row: EmailToken) -> bool:
    """Inte använd och inte utgången."""
    return row.used_at is None and _utc(row.expires_at) > utc_now()


def usable_token_user(db: Session, token: str, purpose: str) -> tuple[EmailToken, User] | None:
    """Raden och användaren för en länk som går att använda nu: rätt sort, inte använd, inte utgången, och skickad
    till den adress användaren har nu. Annars None."""
    row = find_token(db, token, purpose)
    if row is None or not is_usable(row):
        return None
    user = db.get(User, row.user_id)
    if user is None or user.email is None or (row.email or "").lower() != user.email.lower():
        return None
    return row, user


def delete_user_tokens(db: Session, user_id: int) -> None:
    """Tar bort alla länkar för ett konto som raderas. Sparar inte."""
    db.query(EmailToken).filter(EmailToken.user_id == user_id).delete(synchronize_session=False)
