"""Skriptet som lägger in påhittade Stockholmsanvändare, klubbar och events för
användartester (app/seed_demo_users.py). Körs mot testdatabasen, aldrig Neon."""

import random
from datetime import datetime, timezone

from app.auth.security import verify_password
from app.crud.group import join_group
from app.crud.user import get_user_by_username
from app.models import Interest, Municipality, User
from app.models.event import Event, EventResponse
from app.models.group import Group, GroupMember
from app.models.profile import Profile
from app.seed_demo_users import (
    CLUBS,
    EVENTS,
    INTERESTS_PER_USER,
    NAMES,
    PLACES,
    demo_usernames,
    remove,
    seed,
    seed_clubs,
    seed_events,
)


def _library(db, n=40):
    """Kommunen och intressen som skriptet behöver: slumpintressena och de handvalda."""
    db.add(Municipality(code="0180", name="Stockholm"))
    db.add_all([Interest(name=f"Intresse {i}", slug=f"intresse-{i}") for i in range(n)])
    slugs = {club[1] for club in CLUBS} | {event[1] for event in EVENTS}
    db.add_all([Interest(name=slug.capitalize(), slug=slug) for slug in sorted(slugs)])
    db.commit()


def _quiet(_message):
    pass


def _everything(db, users=12, seed_value=1):
    _library(db)
    rng = random.Random(seed_value)
    seed(db, users, rng, log=_quiet)
    seed_clubs(db, rng, log=_quiet)
    seed_events(db, rng, log=_quiet)


# ---------- Användare ----------


def test_creates_users_with_profiles_in_stockholm(db):
    _library(db)

    created = seed(db, 5, random.Random(1), log=_quiet)

    assert created == 5
    users = [get_user_by_username(db, name) for name in demo_usernames()[:5]]
    assert all(u is not None for u in users)
    for user in users:
        assert user.profile_completed
        assert user.profile.municipality_code == "0180"
        assert user.profile.district
        assert len(user.interests) == INTERESTS_PER_USER
        assert user.email is None


def test_passwords_are_random_and_unknown(db):
    _library(db)
    seed(db, 2, random.Random(1), log=_quiet)

    first, second = (get_user_by_username(db, name) for name in demo_usernames()[:2])

    assert first.password_hash != second.password_hash
    assert not verify_password("demo", first.password_hash)
    assert not verify_password(first.username, first.password_hash)


def test_running_twice_does_not_create_duplicates(db):
    _library(db)

    assert seed(db, 4, random.Random(1), log=_quiet) == 4
    assert seed(db, 4, random.Random(2), log=_quiet) == 0

    assert db.query(User).count() == 4
    assert db.query(Profile).count() == 4


def test_creates_at_most_the_listed_names(db):
    _library(db)

    assert seed(db, 100, random.Random(1), log=_quiet) == len(NAMES)


# ---------- Klubbar ----------


def test_creates_clubs_in_stockholm_with_members_and_a_position(db):
    _everything(db)

    clubs = db.query(Group).all()

    assert len(clubs) == len(CLUBS)
    for club in clubs:
        assert club.municipality_code == "0180"
        assert club.latitude is not None and club.longitude is not None
        assert 5 <= len(club.members) <= 11  # ägaren + 5–10 medlemmar
        assert club.created_by in {u.id for u in db.query(User).all()}
        assert [m.role.value for m in club.members].count("owner") == 1


def test_club_places_are_all_in_sweden_and_stockholm_area():
    for _name, _area, latitude, longitude in PLACES.values():
        assert 59.2 < latitude < 59.45
        assert 17.9 < longitude < 18.2


def test_clubs_need_users_first(db):
    _library(db)

    assert seed_clubs(db, random.Random(1), log=_quiet) == 0
    assert seed_events(db, random.Random(1), log=_quiet) == 0


def test_clubs_and_events_are_not_duplicated_when_run_twice(db):
    _everything(db)

    assert seed_clubs(db, random.Random(2), log=_quiet) == 0
    assert seed_events(db, random.Random(2), log=_quiet) == 0

    assert db.query(Group).count() == len(CLUBS)
    assert db.query(Event).count() == len(EVENTS)


# ---------- Events ----------


def test_creates_events_in_the_coming_weeks_with_answers(db):
    _everything(db)

    events = db.query(Event).all()

    assert len(events) == len(EVENTS)
    now = datetime.now(timezone.utc)
    for event in events:
        starts_at = event.starts_at if event.starts_at.tzinfo else event.starts_at.replace(tzinfo=timezone.utc)
        assert 0 < (starts_at - now).days <= 30
        assert event.latitude is not None and event.longitude is not None
        assert event.visibility.value == "open"
        assert 3 <= len(event.responses) <= 7


def test_club_events_belong_to_the_club_and_its_interest(db):
    _everything(db)

    event = db.query(Event).filter(Event.title == "Brädspelskväll för nybörjare").one()
    club = db.query(Group).filter(Group.name == "Brädspelsklubben Söder").one()

    assert event.group_id == club.id
    assert event.interest_id == club.interest_id
    assert event.created_by == club.created_by


def test_events_without_a_club_have_no_group(db):
    _everything(db)

    event = db.query(Event).filter(Event.title == "Schack i parken").one()

    assert event.group_id is None


# ---------- Ta bort ----------


def test_remove_only_deletes_demo_users(db):
    _library(db)
    seed(db, 3, random.Random(1), log=_quiet)
    # Samma förnamn utan prefix, och ett namn med prefix som inte finns i listan.
    db.add_all([
        User(username="alma", password_hash="x"),
        User(username="demo_nagonannan", password_hash="x"),
    ])
    db.commit()

    users, clubs, events = remove(db, log=_quiet)

    assert (users, clubs, events) == (3, 0, 0)
    assert get_user_by_username(db, "demo_alma") is None
    assert get_user_by_username(db, "alma") is not None
    assert get_user_by_username(db, "demo_nagonannan") is not None
    assert db.query(Profile).count() == 0


def test_remove_deletes_clubs_events_and_answers(db):
    _everything(db)

    users, clubs, events = remove(db, log=_quiet)

    assert (users, clubs, events) == (12, len(CLUBS), len(EVENTS))
    assert db.query(User).count() == 0
    assert db.query(Group).count() == 0
    assert db.query(GroupMember).count() == 0
    assert db.query(Event).count() == 0
    assert db.query(EventResponse).count() == 0


def test_remove_deletes_a_demo_club_a_real_user_has_joined(db):
    _everything(db)
    real = User(username="riktig", password_hash="x")
    db.add(real)
    db.commit()
    club = db.query(Group).filter(Group.name == "Fikagänget").one()
    join_group(db, club, real)

    remove(db, log=_quiet)

    # Klubben följer med, i stället för att bli kvar med den riktiga som ägare.
    assert db.query(Group).filter(Group.name == "Fikagänget").first() is None
    assert get_user_by_username(db, "riktig") is not None


def test_remove_leaves_other_clubs_and_events_alone(db):
    _everything(db)
    real = User(username="riktig", password_hash="x")
    db.add(real)
    db.commit()
    other = Group(
        name="Min egen klubb",
        description="Inte en demoklubb",
        interest_id=db.query(Interest).first().id,
        municipality_code="0180",
        created_by=real.id,
    )
    db.add(other)
    db.commit()

    remove(db, log=_quiet)

    assert db.query(Group).filter(Group.name == "Min egen klubb").count() == 1


def test_remove_with_nothing_to_remove(db):
    assert remove(db, log=_quiet) == (0, 0, 0)
