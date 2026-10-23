"""
Gör en användare till moderator (SCRUM-131), eller tar bort det. Moderatorer ser
sidan Moderering i appen, där de hanterar anmälningar och kan stänga av användare.
Det finns ingen knapp i appen för det här, så att ingen kan göra sig själv till moderator.

Kör från backend/:

    python -m app.make_moderator emmy            # emmy blir moderator
    python -m app.make_moderator emmy --ta-bort  # emmy är inte längre moderator

Skriver till den gemensamma databasen (DATABASE_URL), så kör den bara när
migrationen med is_moderator har kommit in i dev och körts (`alembic upgrade head`).
"""

import sys

from app.crud.user import get_user_by_username_or_email
from app.db.session import SessionLocal


def run(db, username: str, remove: bool = False) -> tuple[bool, str]:
    user = get_user_by_username_or_email(db, username)
    if user is None:
        return False, f"Hittade ingen användare som heter {username}."
    user.is_moderator = not remove
    db.commit()
    return True, f"{user.username} är {'inte längre' if remove else 'nu'} moderator."


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print("Ange ett användarnamn: python -m app.make_moderator <användarnamn> [--ta-bort]")
        sys.exit(1)
    db = SessionLocal()
    try:
        ok, message = run(db, args[0], remove="--ta-bort" in sys.argv[1:])
    finally:
        db.close()
    print(message)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
