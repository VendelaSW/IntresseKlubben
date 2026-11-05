"""Listorna med events och klubbar gör inte fler databasfrågor ju fler rader de har: inte för events i privata
klubbar (SCRUM-276), och inte för radernas intressen och deras områden (SCRUM-281)."""

from sqlalchemy import event as sa_event

from app.models import Interest, User
from app.models.event import EventVisibility
from app.models.group import GroupVisibility
from tests.event_helpers import add_event, add_group

# Hur många events och klubbar det blir i den större listan. Var och en får ett eget intresse i ett eget område,
# så att en fråga per rad (för intresset eller dess plats i trädet) skulle synas.
MANY = 6


def _count(db, call):
    queries = []
    listener = lambda *args, **kwargs: queries.append(1)  # noqa: E731
    sa_event.listen(db.get_bind(), "before_cursor_execute", listener)
    try:
        response = call()
    finally:
        sa_event.remove(db.get_bind(), "before_cursor_execute", listener)
    assert response.status_code == 200
    return len(queries)


def test_private_club_events_do_not_add_a_query_each(client, db, user):
    db.add(Interest(id=1, name="Löpning"))
    other = User(id=2, username="other", password_hash="x")
    db.add(other)
    db.commit()

    def private_club_event(name):
        group = add_group(db, other.id, visibility=GroupVisibility.private, members=[user.id], name=name)
        add_event(db, other.id, group_id=group.id, visibility=EventVisibility.invite_only)

    private_club_event("Klubb 0")
    with_one = _count(db, lambda: client.get("/events/"))
    for i in range(1, 6):
        private_club_event(f"Klubb {i}")
    with_six = _count(db, lambda: client.get("/events/"))
    assert len(client.get("/events/").json()) == 6
    assert with_six == with_one


def _interest_in_its_own_area(db, i):
    """Ett intresse under ett eget huvudområde, och områdets slug."""
    area = Interest(name=f"Område {i}", slug=f"omrade-{i}")
    db.add(area)
    db.flush()
    interest = Interest(name=f"Intresse {i}", parent_id=area.id)
    db.add(interest)
    db.commit()
    return interest.id, area.slug


def test_the_events_list_gets_the_interests_and_their_areas_for_the_whole_list_at_once(client, db, user):
    other = User(id=2, username="other", password_hash="x")
    db.add(other)
    db.commit()
    slugs = {}

    def open_event(i):
        interest_id, slugs[f"Intresse {i}"] = _interest_in_its_own_area(db, i)
        add_event(db, other.id, interest_id=interest_id, visibility=EventVisibility.open, title=f"Event {i}")

    open_event(0)
    with_one = _count(db, lambda: client.get("/events/"))
    for i in range(1, MANY):
        open_event(i)
    with_many = _count(db, lambda: client.get("/events/"))

    events = client.get("/events/").json()
    assert len(events) == MANY
    assert {e["interest_name"]: e["interest_area_slug"] for e in events} == slugs
    assert with_many == with_one


def test_the_club_lists_get_the_interests_and_their_areas_for_the_whole_list_at_once(client, db, user, municipalities):
    other = User(id=2, username="other", password_hash="x")
    db.add(other)
    db.commit()
    slugs = {}

    def club(i):
        interest_id, slugs[f"Intresse {i}"] = _interest_in_its_own_area(db, i)
        # Hälften är man med i (Mina klubbar), resten syns under Alla.
        group = add_group(db, other.id, members=[user.id] if i % 2 else [], name=f"Klubb {i}")
        group.interest_id = interest_id
        db.commit()

    club(0)
    club(1)
    all_with_two = _count(db, lambda: client.get("/groups/"))
    overview_with_two = _count(db, lambda: client.get("/groups/overview"))
    for i in range(2, MANY):
        club(i)
    all_with_many = _count(db, lambda: client.get("/groups/"))
    overview_with_many = _count(db, lambda: client.get("/groups/overview"))

    every = client.get("/groups/").json() + client.get("/groups/overview").json()["mine"]
    assert {g["interest_name"]: g["interest_area_slug"] for g in every} == slugs
    assert all_with_many == all_with_two
    assert overview_with_many == overview_with_two
