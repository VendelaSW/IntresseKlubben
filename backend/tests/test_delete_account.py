"""Tester för DELETE /users/me (radera konto).

Riktiga token används hela vägen, som i test_auth.py, så att testerna också
visar att inloggningen slutar fungera när kontot är borta.
"""

import pytest

from app.core import storage
from app.db.base import Base
from app.models import (
    Contact,
    DismissedSuggestion,
    Event,
    EventInvitation,
    EventResponse,
    Group,
    GroupMember,
    Interest,
    Message,
    Profile,
    User,
)
from app.models.event import EventAnswer
from app.models.group import GroupRole
from tests.event_helpers import add_contact, add_event, add_group
from tests.helpers import make_profile

PASSWORD = "hemligt123"


def _register(client, db, username):
    client.post(
        "/users/register",
        json={"username": username, "email": f"{username}@example.com", "password": PASSWORD},
    )
    token = client.post("/users/login", json={"username": username, "password": PASSWORD}).json()["access_token"]
    user = db.query(User).filter(User.username == username).one()
    return user, {"Authorization": f"Bearer {token}"}


def _delete(client, headers, password=PASSWORD):
    return client.request("DELETE", "/users/me", json={"password": password}, headers=headers)


@pytest.fixture
def me(client, db, municipalities):
    db.add(Interest(id=1, name="Löpning"))
    db.commit()
    return _register(client, db, "anna")


@pytest.fixture
def other(client, db, me):
    user, _ = _register(client, db, "bertil")
    return user


def test_wrong_password_deletes_nothing(client, db, me):
    user, headers = me
    response = _delete(client, headers, password="fel-lösenord")

    # 403 och inte 401, så att frontend inte loggar ut för ett felskrivet lösenord.
    assert response.status_code == 403
    assert response.json()["detail"] == "Fel lösenord."
    assert db.get(User, user.id) is not None
    assert client.get("/users/me", headers=headers).status_code == 200


def test_password_is_required(client, me):
    _, headers = me
    assert client.request("DELETE", "/users/me", json={}, headers=headers).status_code == 422


def test_deleting_removes_the_account_and_logs_out(client, db, me):
    user, headers = me
    db.add(make_profile(user.id))
    user.interests.append(db.get(Interest, 1))
    db.commit()

    assert _delete(client, headers).status_code == 204

    db.expire_all()
    assert db.query(User).filter(User.username == "anna").first() is None
    assert db.query(Profile).count() == 0
    # Samma token fungerar inte längre, och det går inte att logga in igen.
    assert client.get("/users/me", headers=headers).status_code == 401
    assert client.post("/users/login", json={"username": "anna", "password": PASSWORD}).status_code == 401


def test_everything_that_points_at_the_account_is_removed(client, db, me, other):
    user, headers = me
    add_contact(db, user.id, other.id)
    db.add_all([
        Message(sender_id=user.id, recipient_id=other.id, text="Hej"),
        Message(sender_id=other.id, recipient_id=user.id, text="Hej själv"),
        DismissedSuggestion(user_id=user.id, dismissed_user_id=other.id),
        DismissedSuggestion(user_id=other.id, dismissed_user_id=user.id),
    ])
    db.commit()
    # Eget event, där den andra är inbjuden och har svarat.
    mine = add_event(db, user.id)
    db.add_all([
        EventInvitation(event_id=mine.id, user_id=other.id),
        EventResponse(event_id=mine.id, user_id=other.id, answer=EventAnswer.yes),
    ])
    # Den andras event, där jag är inbjuden och har svarat.
    theirs = add_event(db, other.id)
    db.add_all([
        EventInvitation(event_id=theirs.id, user_id=user.id),
        EventResponse(event_id=theirs.id, user_id=user.id, answer=EventAnswer.maybe),
    ])
    db.commit()

    assert _delete(client, headers).status_code == 204

    db.expire_all()
    assert db.query(Contact).count() == 0
    assert db.query(Message).count() == 0
    assert db.query(DismissedSuggestion).count() == 0
    assert db.query(EventInvitation).count() == 0
    assert db.query(EventResponse).count() == 0
    # Mitt event är borta, den andras finns kvar.
    assert [e.id for e in db.query(Event).all()] == [theirs.id]


def test_a_block_against_the_account_is_removed_too(client, db, me, other):
    user, headers = me
    add_contact(db, other.id, user.id, status="BLOCKED")

    assert _delete(client, headers).status_code == 204
    db.expire_all()
    assert db.query(Contact).count() == 0


def test_owned_club_goes_to_the_longest_member_and_empty_club_is_removed(client, db, me, other):
    user, headers = me
    shared = add_group(db, user.id, members=[other.id], name="Delad")
    alone = add_group(db, user.id, name="Bara jag")
    shared_id, alone_id = shared.id, alone.id

    assert _delete(client, headers).status_code == 204

    db.expire_all()
    assert db.get(Group, alone_id) is None
    members = db.query(GroupMember).filter(GroupMember.group_id == shared_id).all()
    assert [(m.user_id, m.role) for m in members] == [(other.id, GroupRole.owner)]


def test_other_users_keep_their_own_data(client, db, me, other):
    user, headers = me
    third, _ = _register(client, db, "cecilia")
    db.add(make_profile(other.id, name="Bertil"))
    db.add(Message(sender_id=other.id, recipient_id=third.id, text="Inte till Anna"))
    add_contact(db, other.id, third.id)
    db.commit()

    assert _delete(client, headers).status_code == 204

    db.expire_all()
    assert db.query(Profile).filter(Profile.user_id == other.id).count() == 1
    assert db.query(Message).count() == 1
    assert db.query(Contact).count() == 1


def test_every_column_pointing_at_users_is_handled():
    """Varnar när en ny tabell pekar på users. Neon kontrollerar främmande
    nycklar, så delete_user (crud/user.py) måste radera eller ändra de raderna,
    annars går det inte att radera konton. Lägg till det där, och sedan här."""
    pointing = sorted(
        f"{fk.parent.table.name}.{fk.parent.name}"
        for table in Base.metadata.tables.values()
        for fk in table.foreign_keys
        if fk.column.table.name == "users"
    )
    assert pointing == [
        "contacts.addressee_id",
        "contacts.requester_id",
        "dismissed_suggestions.dismissed_user_id",
        "dismissed_suggestions.user_id",
        "event_invitations.user_id",
        "event_responses.user_id",
        "events.created_by",
        "group_members.user_id",
        "groups.created_by",  # ON DELETE SET NULL: klubben finns kvar utan skapare
        "messages.recipient_id",
        "messages.sender_id",
        "profiles.user_id",
        "user_interests.user_id",
    ]


def test_profile_image_is_removed_from_the_bucket(client, db, me, monkeypatch):
    user, headers = me
    db.add(make_profile(user.id, profile_image_url="profiles/1/abc.webp"))
    db.commit()
    removed = []
    monkeypatch.setattr(storage, "is_configured", lambda: True)
    monkeypatch.setattr(storage, "delete_object", removed.append)

    assert _delete(client, headers).status_code == 204
    assert removed == ["profiles/1/abc.webp"]
