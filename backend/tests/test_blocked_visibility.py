"""Tester för att blockerade användare inte syns för varandra: i personlistan,
på profilen, vid vänförfrågan och i klubbarnas medlemsantal - åt båda håll.
Dessutom GET /users/blocked, listan över dem man själv har blockerat.

Själva blockeringen sätts här direkt i databasen (en Contact-rad med status
BLOCKED, där requester är den som blockerar), så att testerna inte beror på
hur POST /users/{username}/block fungerar."""

from app.auth.security import get_current_user
from app.main import app
from app.models import Group, GroupMember, Interest, Profile, User
from app.models.contact import Contact


def _person(db, username, name):
    person = User(username=username, password_hash="unused")
    db.add(person)
    db.commit()
    db.add(Profile(user_id=person.id, name=name))
    db.commit()
    return person


def _block(db, blocker, blocked):
    db.add(Contact(
        requester_id=blocker.id,
        addressee_id=blocked.id,
        pair_key=f"{min(blocker.id, blocked.id)}:{max(blocker.id, blocked.id)}",
        status="BLOCKED",
    ))
    db.commit()


def _login_as(person):
    app.dependency_overrides[get_current_user] = lambda: person


def _names(response):
    return [p["name"] for p in response.json()]


# --- Personlistan -------------------------------------------------------------


def test_people_list_hides_blocked_users_in_both_directions(client, db, user):
    bob = _person(db, "bob", "Bob")
    carol = _person(db, "carol", "Carol")
    _person(db, "dave", "Dave")
    _block(db, user, bob)    # jag har blockerat Bob
    _block(db, carol, user)  # Carol har blockerat mig

    assert _names(client.get("/users/")) == ["Dave"]


def test_block_only_hides_the_two_users_from_each_other(client, db, user):
    bob = _person(db, "bob", "Bob")
    carol = _person(db, "carol", "Carol")
    dave = _person(db, "dave", "Dave")
    _block(db, user, bob)

    _login_as(dave)

    assert _names(client.get("/users/")) == ["Bob", "Carol"]


def test_unblocking_makes_the_person_visible_again(client, db, user):
    bob = _person(db, "bob", "Bob")
    _block(db, user, bob)
    assert _names(client.get("/users/")) == []

    assert client.delete("/users/bob/block").status_code == 204

    assert _names(client.get("/users/")) == ["Bob"]


# --- Profilen -----------------------------------------------------------------


def test_profile_of_blocked_user_is_hidden_in_both_directions(client, db, user):
    bob = _person(db, "bob", "Bob")
    carol = _person(db, "carol", "Carol")
    _person(db, "dave", "Dave")
    _block(db, user, bob)
    _block(db, carol, user)

    unknown = client.get("/users/finnsinte/profile")
    for username in ("bob", "carol"):
        response = client.get(f"/users/{username}/profile")
        # Exakt samma svar som för en användare som inte finns - annars
        # avslöjar svaret att en blockering finns.
        assert response.status_code == 404
        assert response.json() == unknown.json()
    assert client.get("/users/dave/profile").status_code == 200


# --- Vänförfrågan -------------------------------------------------------------


def test_contact_request_to_or_from_blocked_user_looks_like_unknown_user(client, db, user):
    bob = _person(db, "bob", "Bob")
    carol = _person(db, "carol", "Carol")
    _block(db, user, bob)
    _block(db, carol, user)

    unknown = client.post("/contacts/request", json={"addressee_username": "finnsinte"})
    assert unknown.status_code == 404
    for username in ("bob", "carol"):
        response = client.post("/contacts/request", json={"addressee_username": username})
        assert response.status_code == 404
        assert response.json() == unknown.json()


# --- Listan över dem man själv har blockerat ----------------------------------


def test_blocked_list_shows_only_those_i_blocked(client, db, user):
    bob = _person(db, "bob", "Bob")
    carol = _person(db, "carol", "Carol")
    _person(db, "dave", "Dave")
    _block(db, user, bob)    # jag blockerade Bob: syns i min lista
    _block(db, carol, user)  # Carol blockerade mig: får aldrig synas

    response = client.get("/users/blocked")

    assert response.status_code == 200
    assert [u["username"] for u in response.json()] == ["bob"]
    assert response.json()[0]["name"] == "Bob"


def test_blocked_list_has_no_private_fields(client, db, user):
    _block(db, user, _person(db, "bob", "Bob"))

    body = client.get("/users/blocked").json()[0]

    assert set(body) == {"id", "username", "name", "image_url"}


def test_blocked_list_is_empty_without_blocks_and_shrinks_on_unblock(client, db, user):
    assert client.get("/users/blocked").json() == []
    _block(db, user, _person(db, "bob", "Bob"))
    assert len(client.get("/users/blocked").json()) == 1

    client.delete("/users/bob/block")

    assert client.get("/users/blocked").json() == []


def test_blocked_list_requires_login(client, db):
    assert client.get("/users/blocked").status_code == 401


# --- Klubbarnas medlemsantal --------------------------------------------------


def test_group_member_count_excludes_blocked_users(client, db, user, municipalities):
    interest = Interest(name="Löpning")
    db.add(interest)
    db.commit()
    bob = _person(db, "bob", "Bob")
    carol = _person(db, "carol", "Carol")
    dave = _person(db, "dave", "Dave")
    group = Group(
        name="Morgonlöparna",
        description="Lugna rundor.",
        interest_id=interest.id,
        municipality_code="1480",
        created_by=user.id,
    )
    group.members = [GroupMember(user_id=u.id) for u in (user, bob, carol, dave)]
    db.add(group)
    db.commit()
    _block(db, user, bob)
    _block(db, carol, user)

    # Jag + Dave. Bob och Carol är dolda för mig, och räknas därför inte med.
    assert client.get(f"/groups/{group.id}").json()["member_count"] == 2
    assert [g["member_count"] for g in client.get("/groups/").json()] == [2]
    assert [g["member_count"] for g in client.get("/groups/mine").json()] == [2]

    # Dave har inte blockerat någon och ser alla fyra.
    _login_as(dave)
    assert client.get(f"/groups/{group.id}").json()["member_count"] == 4
