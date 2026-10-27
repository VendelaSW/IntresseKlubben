"""
Räknar embeddings (vektorer) för intressena i databasen, så att intressen som betyder ungefär samma sak går att hitta, och för
Om mig-texterna på profilerna (profile_embeddings, som fylls i när en profil sparas och här för de som saknar en).

Kör från backend/ efter att migrationen med pgvector har mergats och körts (`alembic upgrade head`), och därefter
när intressen har lagts till eller ändrats i biblioteket (`python -m app.sync_interests` gör det automatiskt):

    python -m app.sync_embeddings           # räknar det som saknas eller har ändrats (några ören)
    python -m app.sync_embeddings --kolla   # visar bara hur många som saknas, ändrar inget och anropar inget

Läser intressena ur och skriver vektorerna till den gemensamma databasen (DATABASE_URL), så kör den aldrig från en
branch som inte är mergad. Nyckeln läses ur OPENAI_API_KEY. Det går att köra när som helst: bara det som saknas
eller har ändrats räknas.
"""

import sys

from sqlalchemy.exc import SQLAlchemyError

from app.db.session import SessionLocal
from app.services.interest_embeddings import count_missing, fill_embeddings_report
from app.services.profile_embeddings import count_missing_profiles, fill_profile_embeddings_report


def run(db, check_only: bool = False) -> tuple[bool, str]:
    missing = count_missing(db)
    try:
        missing_profiles = count_missing_profiles(db)
        note = ""
    except SQLAlchemyError:
        db.rollback()  # tabellen profile_embeddings finns inte än (migrationen är inte körd): intressena ska ändå gå att synka
        missing_profiles = 0
        note = " Tabellen profile_embeddings finns inte än (kör alembic upgrade head), så profilerna hoppades över."
    if check_only:
        message = f"{missing} intressen saknar vektor eller har en gammal."
        if missing_profiles:
            message += f" {missing_profiles} profiler saknar vektor eller har en gammal."
        return True, message + note
    ok, message = (True, "Alla intressen har redan en aktuell vektor.") if missing == 0 else fill_embeddings_report(db)
    if missing_profiles:
        profiles_ok, profiles_message = fill_profile_embeddings_report(db)
        ok, message = ok and profiles_ok, f"{message} {profiles_message}"
    return ok, message + note


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
