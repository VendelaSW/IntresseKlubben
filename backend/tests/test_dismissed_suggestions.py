"""Tester för "Ta bort kontaktförslag": POST och DELETE /users/{user_id}/dismiss,
GET /users/dismissed-suggestions (antalet borttagna) och DELETE
/users/dismissed-suggestions (nollställning av alla borttagna)."""

from app.auth.security import get_current_user
from app.main import app
from app.models.user import User
from tests.helpers import make_profile


def _create_person(db, username, name):
    person = User(username=username, password_hash="unused")
    db.add(person)
    db.commit()
    db.add(make_profile(person.id, name=name))
    db.commit()
    return person


def test_dismiss_removes_person_from_suggestions(client, db, user):
    bob = _create_person(db, "bob", "Bob")

    response = client.post(f"/users/{bob.id}/dismiss")
    assert response.status_code == 204

    names = [p["name"] for p in client.get("/users/").json()]
    assert names == []
    # Bob finns fortfarande - bara dold från förslag, inte borttagen.
    assert db.get(User, bob.id) is not None


def test_dismiss_is_idempotent(client, db, user):
    bob = _create_person(db, "bob", "Bob")

    assert client.post(f"/users/{bob.id}/dismiss").status_code == 204
    assert client.post(f"/users/{bob.id}/dismiss").status_code == 204

    names = [p["name"] for p in client.get("/users/").json()]
    assert names == []


def test_dismiss_rejects_self_and_missing_user(client, db, user):
    db.add(make_profile(user.id, name="Jag"))
    db.commit()

    assert client.post(f"/users/{user.id}/dismiss").status_code == 400
    assert client.post("/users/9999/dismiss").status_code == 404


def test_reset_brings_dismissed_suggestions_back(client, db, user):
    bob = _create_person(db, "bob", "Bob")
    client.post(f"/users/{bob.id}/dismiss")
    assert [p["name"] for p in client.get("/users/").json()] == []

    response = client.delete("/users/dismissed-suggestions")
    assert response.status_code == 204

    names = [p["name"] for p in client.get("/users/").json()]
    assert names == ["Bob"]


def test_dismiss_requires_login(client, db):
    assert client.post("/users/2/dismiss").status_code == 401


def test_reset_requires_login(client, db):
    assert client.delete("/users/dismissed-suggestions").status_code == 401


def test_count_dismissed_suggestions(client, db, user):
    bob = _create_person(db, "bob", "Bob")
    cecilia = _create_person(db, "cecilia", "Cecilia")
    assert client.get("/users/dismissed-suggestions").json() == {"count": 0}

    client.post(f"/users/{bob.id}/dismiss")
    client.post(f"/users/{bob.id}/dismiss")  # samma igen räknas inte två gånger
    client.post(f"/users/{cecilia.id}/dismiss")
    assert client.get("/users/dismissed-suggestions").json() == {"count": 2}

    client.delete("/users/dismissed-suggestions")
    assert client.get("/users/dismissed-suggestions").json() == {"count": 0}


def test_count_only_includes_own_dismissals(client, db, user):
    bob = _create_person(db, "bob", "Bob")
    client.post(f"/users/{bob.id}/dismiss")
    app.dependency_overrides[get_current_user] = lambda: bob
    assert client.get("/users/dismissed-suggestions").json() == {"count": 0}


def test_undo_dismiss_brings_person_back(client, db, user):
    bob = _create_person(db, "bob", "Bob")
    cecilia = _create_person(db, "cecilia", "Cecilia")
    client.post(f"/users/{bob.id}/dismiss")
    client.post(f"/users/{cecilia.id}/dismiss")

    assert client.delete(f"/users/{bob.id}/dismiss").status_code == 204

    # Bara Bob kommer tillbaka, Cecilia är fortfarande borttagen.
    assert [p["name"] for p in client.get("/users/").json()] == ["Bob"]
    assert client.get("/users/dismissed-suggestions").json() == {"count": 1}


def test_undo_dismiss_is_idempotent(client, db, user):
    bob = _create_person(db, "bob", "Bob")
    assert client.delete(f"/users/{bob.id}/dismiss").status_code == 204
    assert client.delete(f"/users/{bob.id}/dismiss").status_code == 204
