from datetime import timedelta

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Event, EventInvitation, EventResponse, Group, Interest, User
from app.models.event import EventAnswer, EventVisibility
from tests.event_helpers import add_event, add_group, future


@pytest.fixture(autouse=True)
def interests(db):
    rows = [Interest(id=1, name="Löpning"), Interest(id=2, name="Schack")]
    db.add_all(rows)
    db.commit()
    return rows


@pytest.fixture
def other(db, user):
    row = User(id=2, username="other", password_hash="unused")
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def event(db, user):
    return add_event(db, user.id, title="Löpning", starts_at=future(days=5), ends_at=future(days=5, hours=2))


def login_as(person):
    app.dependency_overrides[get_current_user] = lambda: person


def patch(client, event, **body):
    return client.patch(f"/events/{event.id}", json=body)


# ---------- Redigera ----------


def test_edit_changes_only_the_fields_that_are_sent(client, db, user, event):
    new_start = future(days=6)
    response = patch(
        client,
        event,
        title="  Kvällslöpning  ",
        description="Ny beskrivning",
        interest_id=2,
        starts_at=new_start.isoformat(),
        ends_at=(new_start + timedelta(hours=3)).isoformat(),
        place_name="Ny plats",
        address="Nya gatan 2",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Kvällslöpning"
    assert body["description"] == "Ny beskrivning"
    assert body["interest_name"] == "Schack"
    assert body["place_name"] == "Ny plats"
    assert body["address"] == "Nya gatan 2"

    only_title = patch(client, event, title="Bara titel").json()
    assert only_title["title"] == "Bara titel"
    assert only_title["description"] == "Ny beskrivning"
    assert only_title["place_name"] == "Ny plats"


def test_empty_body_changes_nothing(client, db, user, event):
    response = client.patch(f"/events/{event.id}", json={})
    assert response.status_code == 200
    assert response.json()["title"] == "Löpning"


def test_end_time_can_be_removed_with_null(client, db, user, event):
    response = patch(client, event, ends_at=None)
    assert response.status_code == 200
    assert response.json()["ends_at"] is None


def test_end_time_can_be_added_later(client, db, user):
    event = add_event(db, user.id, starts_at=future(days=5))
    response = patch(client, event, ends_at=future(days=5, hours=1).isoformat())
    assert response.status_code == 200
    assert response.json()["ends_at"] is not None


@pytest.mark.parametrize("field", ["title", "description", "place_name", "address", "interest_id", "starts_at"])
def test_required_fields_cannot_be_emptied(client, db, user, event, field):
    assert patch(client, event, **{field: None}).status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"title": "   "},
        {"title": "x" * 51},
        {"description": ""},
        {"description": "x" * 801},
        {"place_name": " "},
        {"place_name": "x" * 101},
        {"address": ""},
        {"address": "x" * 101},
        {"starts_at": "2030-05-01T18:00:00"},  # utan tidszon
    ],
)
def test_invalid_values_are_rejected(client, db, user, event, changes):
    assert patch(client, event, **changes).status_code == 422
    assert db.get(Event, event.id).title == "Löpning"


def test_times_must_make_sense_together(client, db, user, event):
    # Starten i det förflutna.
    assert patch(client, event, starts_at=(future(days=-1)).isoformat()).status_code == 422
    # Sluttid före den befintliga starten.
    assert patch(client, event, ends_at=future(days=4).isoformat()).status_code == 422
    # Ny start efter den befintliga sluttiden.
    too_late = patch(client, event, starts_at=future(days=9).isoformat())
    assert too_late.status_code == 422
    assert too_late.json()["detail"] == "Sluttiden måste vara efter starttiden"
    # Flyttar man både start och slut går det bra.
    both = patch(client, event, starts_at=future(days=9).isoformat(), ends_at=future(days=9, hours=1).isoformat())
    assert both.status_code == 200


def test_unknown_interest_is_rejected(client, db, user, event):
    response = patch(client, event, interest_id=999)
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"


@pytest.mark.parametrize("field,value", [("visibility", "open"), ("group_id", 1), ("created_by", 2)])
def test_visibility_group_and_creator_cannot_be_changed(client, db, user, event, field, value):
    assert patch(client, event, **{field: value}).status_code == 422


def test_editing_does_not_touch_invitations_or_answers(client, db, user, other, event):
    db.add_all([
        EventInvitation(event_id=event.id, user_id=other.id),
        EventResponse(event_id=event.id, user_id=other.id, answer=EventAnswer.yes),
    ])
    db.commit()
    assert patch(client, event, title="Ändrad").status_code == 200
    assert db.query(EventInvitation).count() == 1
    assert db.query(EventResponse).count() == 1


def test_only_the_creator_can_edit(client, db, user, other):
    event = add_event(db, other.id, title="Deras", visibility=EventVisibility.open)
    response = patch(client, event, title="Mitt nu")
    assert response.status_code == 403
    assert db.get(Event, event.id).title == "Deras"


def test_a_hidden_event_looks_like_a_missing_one(client, db, user, other):
    hidden = add_event(db, other.id, visibility=EventVisibility.invite_only)
    for response in (patch(client, hidden, title="x"), client.patch("/events/99999", json={"title": "x"})):
        assert response.status_code == 404
        assert response.json()["detail"] == "Eventet finns inte"


# ---------- Ta bort ----------


def test_creator_can_delete_the_event_with_its_invitations_and_answers(client, db, user, other, event):
    db.add_all([
        EventInvitation(event_id=event.id, user_id=other.id),
        EventResponse(event_id=event.id, user_id=other.id, answer=EventAnswer.maybe),
    ])
    db.commit()

    assert client.delete(f"/events/{event.id}").status_code == 204
    assert db.query(Event).count() == 0
    assert db.query(EventInvitation).count() == 0
    assert db.query(EventResponse).count() == 0
    assert client.get("/events/").json() == []
    assert client.delete(f"/events/{event.id}").status_code == 404


def test_deleting_an_event_removes_it_for_everyone(client, db, user, other):
    event = add_event(db, user.id, title="Öppet", visibility=EventVisibility.open)
    login_as(other)
    assert [e["title"] for e in client.get("/events/").json()] == ["Öppet"]
    login_as(user)
    client.delete(f"/events/{event.id}")
    login_as(other)
    assert client.get("/events/").json() == []


def test_deleting_an_event_does_not_delete_its_club(client, db, user):
    group = add_group(db, user.id)
    grouped = add_event(db, user.id, group_id=group.id)
    assert client.delete(f"/events/{grouped.id}").status_code == 204
    assert db.get(Group, group.id) is not None


def test_a_past_event_can_still_be_deleted_by_its_creator(client, db, user):
    old = add_event(db, user.id, starts_at=future(days=-3))
    assert client.delete(f"/events/{old.id}").status_code == 204
    assert db.query(Event).count() == 0


def test_only_the_creator_can_delete(client, db, user, other):
    event = add_event(db, other.id, visibility=EventVisibility.open)
    assert client.delete(f"/events/{event.id}").status_code == 403
    assert db.query(Event).count() == 1


def test_a_hidden_event_cannot_be_deleted_and_looks_missing(client, db, user, other):
    hidden = add_event(db, other.id, visibility=EventVisibility.invite_only)
    response = client.delete(f"/events/{hidden.id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Eventet finns inte"
    assert db.query(Event).count() == 1
