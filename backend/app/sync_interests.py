"""
Läser in intressebiblioteket (app/data/interests.json) i databasen.

Kör från backend/ efter att en ändring i biblioteket har mergats, på samma
sätt som `alembic upgrade head` (se CONTRIBUTING.md):

    python -m app.sync_interests

Ändrar den gemensamma databasen (DATABASE_URL), så kör den aldrig från en
branch som inte är mergad.
"""

from app.crud.interest_library import load_library, sync_library
from app.db.session import SessionLocal


def main() -> None:
    entries = load_library()
    db = SessionLocal()
    try:
        result = sync_library(db, entries)
    finally:
        db.close()
    print(
        f"Intressebiblioteket ({len(entries)} intressen): "
        f"{result.added} nya, {result.updated} ändrade, {result.deactivated} inaktiverade."
    )


if __name__ == "__main__":
    main()
