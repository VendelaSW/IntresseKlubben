"""
Läser in intressebiblioteket (app/data/interests.json) i databasen.

Kör från backend/ efter att en ändring i biblioteket har mergats, på samma
sätt som `alembic upgrade head` (se CONTRIBUTING.md):

    python -m app.sync_interests

Ändrar den gemensamma databasen (DATABASE_URL), så kör den aldrig från en
branch som inte är mergad. Räknar också vektorer (embeddings) för nya och
ändrade intressen, se sync_embeddings.py.
"""

from app.crud.interest_library import load_library, sync_library
from app.db.session import SessionLocal
from app.services.interest_embeddings import fill_embeddings_report


def main() -> None:
    entries = load_library()
    db = SessionLocal()
    try:
        result = sync_library(db, entries)
        # Nya och ändrade intressen får en vektor direkt. Går det inte (ingen nyckel, OpenAI nere) är synken ändå
        # klar, och `python -m app.sync_embeddings` kan köras senare.
        _, embeddings = fill_embeddings_report(db)
    finally:
        db.close()
    print(
        f"Intressebiblioteket ({len(entries)} intressen): "
        f"{result.added} nya, {result.updated} ändrade, {result.deactivated} inaktiverade."
    )
    print(f"Vektorer: {embeddings}")


if __name__ == "__main__":
    main()
