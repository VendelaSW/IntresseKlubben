"""
Döljer intressen som användare har lagt till, till exempel testintressen från utvecklingen. Kör från backend/:

    python -m app.hide_interests                  listar alla intressen som användare har lagt till, ändrar inget
    python -m app.hide_interests --dolj 12 40     döljer intressena med id 12 och 40
    python -m app.hide_interests --visa 12        gör id 12 synligt igen (ångrar --dolj)

Ett dolt intresse får status inactive: det raderas inte, och kopplingarna finns kvar. Det syns inte längre i
biblioteket, sökningen, intresseträdet eller kartan och går inte att välja, men det ligger kvar på profilerna hos
dem som redan har det. Bibliotekets egna intressen (app/data/interests.json) listas inte och kan inte döljas här:
de styrs av `python -m app.sync_interests`.

Ändrar databasen som DATABASE_URL pekar på, så skriptet skriver ut vilken databas det gäller innan det gör något.
"""

import argparse

from sqlalchemy import func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.interest import Interest, InterestSource, InterestStatus
from app.models.user import User
from app.models.user_interest import UserInterest


def added_by_users(db: Session) -> list[tuple[Interest, str | None, int]]:
    """Alla intressen som inte kommer från biblioteket, med skaparens användarnamn och hur många som har dem."""
    users = (
        db.query(UserInterest.interest_id, func.count(func.distinct(UserInterest.user_id)).label("n"))
        .group_by(UserInterest.interest_id)
        .subquery()
    )
    rows = (
        db.query(Interest, User.username, func.coalesce(users.c.n, 0))
        .outerjoin(User, User.id == Interest.created_by_user_id)
        .outerjoin(users, users.c.interest_id == Interest.id)
        .filter(Interest.source != InterestSource.library.value)
        .order_by(Interest.status, func.lower(Interest.name))
        .all()
    )
    return [(interest, username, count) for interest, username, count in rows]


def set_status(db: Session, ids: list[int], status: InterestStatus, log=print) -> int:
    """Sätter status på intressena med de här id:na. Bibliotekets intressen och okända id hoppas över. Ger antalet ändrade."""
    changed = 0
    for interest_id in ids:
        interest = db.get(Interest, interest_id)
        if interest is None:
            log(f"  {interest_id}: finns inte, hoppar över")
            continue
        if interest.source == InterestSource.library.value:
            log(f"  {interest_id} {interest.name}: hör till biblioteket, hoppar över")
            continue
        if interest.status == status.value:
            log(f"  {interest_id} {interest.name}: är redan {status.value}")
            continue
        interest.status = status.value
        changed += 1
        log(f"  {interest_id} {interest.name}: {status.value}")
    db.commit()
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Lista, dölj och visa intressen som användare har lagt till.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--dolj", nargs="+", type=int, metavar="ID", help="dölj intressena (status inactive)")
    action.add_argument("--visa", nargs="+", type=int, metavar="ID", help="gör intressena synliga igen (status active)")
    args = parser.parse_args()

    url = make_url(settings.database_url)
    print(f"Databas: {url.get_backend_name()} {url.host or url.database}")
    with SessionLocal() as db:
        if args.dolj or args.visa:
            status = InterestStatus.inactive if args.dolj else InterestStatus.active
            changed = set_status(db, args.dolj or args.visa, status)
            print(f"Klart: {changed} ändrade.")
            return
        rows = added_by_users(db)
        if not rows:
            print("Inga intressen har lagts till av användare.")
            return
        print(f"{'id':>6}  {'status':<9} {'källa':<16} {'personer':>8}  {'skapad av':<20} namn")
        for interest, username, count in rows:
            print(f"{interest.id:>6}  {interest.status:<9} {interest.source:<16} {count:>8}  {username or '-':<20} {interest.name}")
        print(f"{len(rows)} intressen. Inget ändrades. Dölj med --dolj ID ..., ångra med --visa ID ...")


if __name__ == "__main__":
    main()
