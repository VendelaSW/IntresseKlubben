"""SCRUM-276: listan med events gör inte fler frågor ju fler events i privata klubbar det finns."""

from sqlalchemy import event as sa_event

from app.models import Interest, User
from app.models.event import EventVisibility
from app.models.group import GroupVisibility
from tests.event_helpers import add_event, add_group


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
