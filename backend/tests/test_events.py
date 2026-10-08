from datetime import datetime, timedelta, timezone

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Contact, Event, EventInvitation, GroupMember, Interest, User
from app.models.event import EventVisibility
from app.models.group import GroupVisibility
from tests.event_helpers import add_contact, add_event, add_group, future, payload


@pytest.fixture
def interest(db):
    row = Interest(id=1, name="Löpning")
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def other(db):
    row = User(id=2, username="other", password_hash="unused")
    db.add(row)
    db.commit()
    return row


def login_as(other_user):
    app.dependency_overrides[get_current_user] = lambda: other_user


def titles(client):
    response = client.get("/events/")
    assert response.status_code == 200
    return [e["title"] for e in response.json()]


# ---------- Skapa ----------


def test_create_event_defaults_to_invite_only(client, user, interest):
    response = client.post("/events/", json=payload())
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Morgonlöpning"
    assert body["visibility"] == "invite_only"
    assert body["ends_at"] is None
    assert body["group_id"] is None
    assert body["interest_name"] == "Löpning"
    assert body["creator_username"] == "testuser"
    assert body["is_owner"] is True


def test_create_open_event_with_end_time_and_trimmed_text(client, user, interest):
    response = client.post(
        "/events/",
        json=payload(
            title="  Löpning  ",
            visibility="open",
            ends_at=future(hours=2).isoformat(),
        ),
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Löpning"
    assert response.json()["visibility"] == "open"
    assert response.json()["ends_at"] is not None


@pytest.mark.parametrize("missing", ["title", "description", "interest_id", "starts_at", "place_name", "address"])
def test_required_fields_are_required(client, user, interest, missing):
    body = payload()
    del body[missing]
    assert client.post("/events/", json=body).status_code == 422


@pytest.mark.parametrize(
    "overrides",
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
        {"starts_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
        {"ends_at": future(days=6).isoformat()},  # före starten
        {"visibility": "hemligt"},
    ],
)
def test_invalid_values_are_rejected(client, user, interest, overrides):
    assert client.post("/events/", json=payload(**overrides)).status_code == 422


def test_unknown_interest_is_rejected(client, user, interest):
    response = client.post("/events/", json=payload(interest_id=999))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"


def test_inactive_interest_is_rejected_when_creating_and_editing(client, db, user, interest):
    # Ett inaktivt intresse (t.ex. Gaming, som slogs ihop med Tv-spel) syns inte
    # och går inte att välja, inte heller via API:t. Samma fel som ett okänt.
    db.add(Interest(id=2, name="Gaming", status="inactive"))
    db.commit()
    response = client.post("/events/", json=payload(interest_id=2))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"

    own = add_event(db, user.id)
    response = client.patch(f"/events/{own.id}", json={"interest_id": 2})
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"


def test_create_event_in_own_group(client, db, user, interest, municipalities):
    group = add_group(db, user.id)
    response = client.post("/events/", json=payload(group_id=group.id, visibility="open"))
    assert response.status_code == 201
    assert response.json()["group_id"] == group.id
    assert response.json()["group_name"] == "Löparna"
    assert response.json()["visibility"] == "open"


def test_event_in_private_group_cannot_be_open(client, db, user, interest, municipalities):
    group = add_group(db, user.id, visibility=GroupVisibility.private)
    response = client.post("/events/", json=payload(group_id=group.id, visibility="open"))
    assert response.status_code == 422
    assert response.json()["detail"] == "Events i privata klubbar kan inte vara öppna"
    assert db.query(Event).count() == 0


def test_event_in_private_group_is_invite_only_when_visibility_is_left_out(
    client, db, user, interest, municipalities
):
    group = add_group(db, user.id, visibility=GroupVisibility.private)
    response = client.post("/events/", json=payload(group_id=group.id))
    assert response.status_code == 201
    assert response.json()["visibility"] == "invite_only"
    explicit = client.post("/events/", json=payload(group_id=group.id, visibility="invite_only"))
    assert explicit.status_code == 201


def test_cannot_create_event_in_a_group_you_are_not_in(client, db, user, other, interest, municipalities):
    public = add_group(db, other.id)
    response = client.post("/events/", json=payload(group_id=public.id))
    assert response.status_code == 403
    assert db.query(Event).count() == 0


def test_private_group_is_not_revealed_to_non_members(client, db, user, other, interest, municipalities):
    private = add_group(db, other.id, visibility=GroupVisibility.private)
    missing = client.post("/events/", json=payload(group_id=9999))
    hidden = client.post("/events/", json=payload(group_id=private.id))
    assert missing.status_code == hidden.status_code == 404
    assert missing.json() == hidden.json()


# ---------- Lista ----------


def test_list_shows_own_events_even_when_invite_only(client, db, user, interest):
    add_event(db, user.id, title="Mitt")
    assert titles(client) == ["Mitt"]


def test_list_hides_invite_only_events_from_others_but_shows_open_ones(client, db, user, other, interest):
    add_event(db, other.id, title="Öppet", visibility=EventVisibility.open)
    add_event(db, other.id, title="Hemligt", visibility=EventVisibility.invite_only)
    assert titles(client) == ["Öppet"]


def test_list_shows_invite_only_event_to_invited_user(client, db, user, other, interest):
    event = add_event(db, other.id, title="Hemligt", visibility=EventVisibility.invite_only)
    db.add(EventInvitation(event_id=event.id, user_id=user.id))
    db.commit()
    assert titles(client) == ["Hemligt"]


def test_list_shows_group_events_to_current_members_only(client, db, user, other, interest, municipalities):
    group = add_group(db, other.id, visibility=GroupVisibility.private)
    add_event(db, other.id, title="Klubbträff", group_id=group.id, visibility=EventVisibility.invite_only)
    assert titles(client) == []

    # Den som går med efter att eventet skapats ser det också.
    db.add(GroupMember(group_id=group.id, user_id=user.id))
    db.commit()
    assert titles(client) == ["Klubbträff"]


def test_list_hides_events_from_blocked_users_in_both_directions(client, db, user, other, interest):
    add_event(db, other.id, title="Öppet", visibility=EventVisibility.open)
    assert titles(client) == ["Öppet"]

    add_contact(db, user.id, other.id, status="BLOCKED")
    assert titles(client) == []

    # Blockeringen åt andra hållet gör samma sak.
    block = db.query(Contact).one()
    block.requester_id, block.addressee_id = other.id, user.id
    db.commit()
    assert titles(client) == []


def test_list_hides_past_events_but_keeps_them_in_the_database(client, db, user, interest):
    now = datetime.now(timezone.utc)
    # Utan sluttid: passerat 24 timmar efter starten.
    add_event(db, user.id, title="Igår utan slut", starts_at=now - timedelta(hours=23))
    add_event(db, user.id, title="För länge sedan utan slut", starts_at=now - timedelta(hours=25))
    # Med sluttid: passerat vid sluttiden, utan extra dygn.
    add_event(
        db, user.id, title="Pågår", starts_at=now - timedelta(hours=3), ends_at=now + timedelta(hours=1)
    )
    add_event(
        db, user.id, title="Slut nyss", starts_at=now - timedelta(hours=5), ends_at=now - timedelta(hours=1)
    )

    assert titles(client) == ["Igår utan slut", "Pågår"]
    assert db.query(Event).count() == 4


def test_list_is_sorted_by_start_time(client, db, user, interest):
    add_event(db, user.id, title="Sist", starts_at=future(days=9))
    add_event(db, user.id, title="Först", starts_at=future(days=2))
    add_event(db, user.id, title="Mitten", starts_at=future(days=5))
    assert titles(client) == ["Först", "Mitten", "Sist"]


def test_list_shows_creator_name_from_profile(client, db, user, other, interest):
    add_event(db, other.id, visibility=EventVisibility.open)
    event = client.get("/events/").json()[0]
    assert event["creator_username"] == "other"
    assert event["creator_name"] is None
    assert event["is_owner"] is False


# ---------- Gäster får bjuda in ----------


def test_guests_can_invite_is_off_by_default_and_can_be_set_when_creating(client, user, interest):
    default = client.post("/events/", json=payload()).json()
    assert default["guests_can_invite"] is False
    assert default["can_invite"] is True  # skaparen får alltid

    on = client.post("/events/", json=payload(guests_can_invite=True)).json()
    assert on["guests_can_invite"] is True


def test_can_invite_is_true_for_guests_only_when_the_setting_is_on(client, db, user, other, interest):
    off = add_event(db, other.id, title="Av", visibility=EventVisibility.open)
    on = add_event(db, other.id, title="På", visibility=EventVisibility.open, guests_can_invite=True)
    by_title = {e["title"]: e for e in client.get("/events/").json()}
    assert by_title["Av"]["can_invite"] is False
    assert by_title["På"]["can_invite"] is True
    assert by_title["På"]["is_owner"] is False


def test_the_creator_can_turn_the_setting_on_and_off_but_nobody_else(client, db, user, other, interest):
    own = add_event(db, user.id)
    assert client.patch(f"/events/{own.id}", json={"guests_can_invite": True}).json()["guests_can_invite"] is True
    assert client.patch(f"/events/{own.id}", json={"guests_can_invite": False}).json()["guests_can_invite"] is False
    assert client.patch(f"/events/{own.id}", json={"guests_can_invite": None}).status_code == 422

    theirs = add_event(db, other.id, visibility=EventVisibility.open)
    assert client.patch(f"/events/{theirs.id}", json={"guests_can_invite": True}).status_code == 403
