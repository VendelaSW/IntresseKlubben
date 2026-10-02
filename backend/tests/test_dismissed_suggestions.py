"""Tester för "Ta bort kontaktförslag": POST /users/{username}/dismiss
och DELETE /users/dismissed-suggestions (nollställning av alla borttagna)."""

from app.models.profile import Profile
from app.models.user import User


def _create_person(db, username, name):
    person = User(username=username, password_hash="unused")
    db.add(person)
    db.commit()
    db.add(Profile(user_id=person.id, name=name))
    db.commit()
    return person


def test_dismiss_removes_person_from_suggestions(client, db, user):
    bob = _create_person(db, "bob", "Bob")

    response = client.post("/users/bob/dismiss")
    assert response.status_code == 204

    names = [p["name"] for p in client.get("/users/").json()]
    assert names == []
    # Bob finns fortfarande - bara dold från förslag, inte borttagen.
    assert db.get(User, bob.id) is not None


def test_dismiss_is_idempotent(client, db, user):
    _create_person(db, "bob", "Bob")

    assert client.post("/users/bob/dismiss").status_code == 204
    assert client.post("/users/bob/dismiss").status_code == 204

    names = [p["name"] for p in client.get("/users/").json()]
    assert names == []


def test_dismiss_rejects_self_and_missing_user(client, db, user):
    db.add(Profile(user_id=user.id, name="Jag"))
    db.commit()

    assert client.post(f"/users/{user.username}/dismiss").status_code == 400
    assert client.post("/users/okand/dismiss").status_code == 404


def test_reset_brings_dismissed_suggestions_back(client, db, user):
    _create_person(db, "bob", "Bob")
    client.post("/users/bob/dismiss")
    assert [p["name"] for p in client.get("/users/").json()] == []

    response = client.delete("/users/dismissed-suggestions")
    assert response.status_code == 204

    names = [p["name"] for p in client.get("/users/").json()]
    assert names == ["Bob"]


def test_dismiss_requires_login(client, db):
    assert client.post("/users/bob/dismiss").status_code == 401


def test_reset_requires_login(client, db):
    assert client.delete("/users/dismissed-suggestions").status_code == 401
