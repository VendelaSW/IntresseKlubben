"""
Räknar embeddings (vektorer) för intressena i databasen, så att intressen som betyder ungefär samma sak går att hitta.

Kör från backend/ efter att migrationen med pgvector har mergats och körts (`alembic upgrade head`), och därefter
när intressen har lagts till eller ändrats i biblioteket (`python -m app.sync_interests` gör det automatiskt):

    python -m app.sync_embeddings           # räknar det som saknas eller har ändrats (några ören)
    python -m app.sync_embeddings --kolla   # visar bara hur många som saknas, ändrar inget och anropar inget

Läser intressena ur och skriver vektorerna till den gemensamma databasen (DATABASE_URL), så kör den aldrig från en
branch som inte är mergad. Nyckeln läses ur OPENAI_API_KEY. Det går att köra när som helst: bara det som saknas
eller har ändrats räknas.
"""

import sys

from app.db.session import SessionLocal
from app.services.interest_embeddings import count_missing, fill_embeddings_report


def run(db, check_only: bool = False) -> tuple[bool, str]:
    missing = count_missing(db)
    if check_only:
        return True, f"{missing} intressen saknar vektor eller har en gammal."
    if missing == 0:
        return True, "Alla intressen har redan en aktuell vektor."
    return fill_embeddings_report(db)


def main() -> None:
    db = SessionLocal()
    try:
        ok, message = run(db, check_only="--kolla" in sys.argv[1:])
    finally:
        db.close()
    print(message)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
