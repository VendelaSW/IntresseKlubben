"""Tester för GET /groups/member/{user_id}: klubbarna en person är med i, på personens profil."""

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Contact, Interest, User

URL = "/groups/member/{}"


@pytest.fixture
def interest(db):
    item = Interest(name="Löpning")
    db.add(item)
    db.commit()
    return item


@pytest.fixture
def other(db):
    person = User(id=2, username="bertil", password_hash="unused")
    db.add(person)
    db.commit()
    return person


def _login_as(person: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: person


def _create_group(client, interest, name, visibility="public"):
    response = client.post("/groups/", json={
        "name": name,
        "description": "En klubb.",
        "interest_id": interest.id,
        "municipality_code": "1480",
        "visibility": visibility,
    })
    assert response.status_code == 201, response.json()
    return response.json()


def _names(client, user_id):
    response = client.get(URL.format(user_id))
    assert response.status_code == 200, response.json()
    return [g["name"] for g in response.json()]


def test_shows_the_persons_open_clubs(client, user, other, interest, municipalities):
    _login_as(other)
    _create_group(client, interest, "Morgonlöparna")
    _create_group(client, interest, "Kvällslöparna")
    _login_as(user)
    assert _names(client, other.id) == ["Kvällslöparna", "Morgonlöparna"]


def test_private_club_is_hidden_from_others(client, user, other, interest, municipalities):
    _login_as(other)
    _create_group(client, interest, "Öppna")
    _create_group(client, interest, "Hemliga", visibility="private")
    _login_as(user)
    assert _names(client, other.id) == ["Öppna"]


def test_private_club_shows_for_its_members(client, db, user, other, interest, municipalities):
    _login_as(other)
    private = _create_group(client, interest, "Hemliga", visibility="private")
    # user bjuds in och går med, så att båda är medlemmar.
    db.add(Contact(requester_id=other.id, addressee_id=user.id, pair_key=f"{user.id}:{other.id}", status="ACCEPTED"))
    db.commit()
    assert client.post(f"/groups/{private['id']}/invitations", json={"user_ids": [user.id]}).status_code in (200, 201)
    _login_as(user)
    assert client.put(f"/groups/{private['id']}/members/me").status_code == 200
    assert _names(client, other.id) == ["Hemliga"]


def test_own_clubs_including_private(client, user, interest, municipalities):
    _create_group(client, interest, "Hemliga", visibility="private")
    assert _names(client, user.id) == ["Hemliga"]


def test_blocked_or_unknown_person_gives_404(client, db, user, other, interest, municipalities):
    assert client.get(URL.format(9999)).status_code == 404
    db.add(Contact(requester_id=other.id, addressee_id=user.id, pair_key=f"{user.id}:{other.id}", status="BLOCKED"))
    db.commit()
    assert client.get(URL.format(other.id)).status_code == 404
