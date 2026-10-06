import pytest
from sqlalchemy.exc import IntegrityError

from app.auth.security import hash_password, verify_password
from app.crud.user import get_user_by_username
from app.models import User


def _register(client, username="vendela", email="vendela@example.com", password="hemligt123"):
    return client.post(
        "/users/register", json={"username": username, "email": email, "password": password}
    )


def test_register_creates_user_without_leaking_password_or_email(client, db):
    response = _register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "vendela"
    # E-post är privat och ska inte skickas ut, inte ens till den som registrerar sig.
    assert set(body) == {"id", "username", "created_at"}

    stored = get_user_by_username(db, "vendela")
    assert stored.email == "vendela@example.com"
    assert stored.password_hash != "hemligt123"
    assert verify_password("hemligt123", stored.password_hash)


def test_register_rejects_taken_username(client):
    _register(client)
    response = _register(client, email="annan@example.com", password="annat12345")
    assert response.status_code == 409
    assert response.json()["detail"] == "Användarnamnet är upptaget."


def test_register_rejects_taken_username_different_case(client):
    _register(client, username="Vendela")
    response = _register(client, username="vendela", email="annan@example.com", password="annat12345")
    assert response.status_code == 409


def test_register_rejects_taken_email(client):
    _register(client)
    response = _register(client, username="annan")
    assert response.status_code == 409
    assert response.json()["detail"] == "E-postadressen används redan."


def test_register_rejects_taken_email_different_case(client):
    _register(client, email="Vendela@Example.com")
    response = _register(client, username="annan", email="vendela@example.COM")
    assert response.status_code == 409


def test_register_saves_email_in_lowercase(client, db):
    _register(client, email="  Vendela@Example.COM ")
    assert get_user_by_username(db, "vendela").email == "vendela@example.com"


def test_database_rejects_usernames_differing_only_in_case(db):
    # Skyddsnätet under koden: även om något skriver direkt till tabellen
    # (eller två registreringar sker samtidigt) ska databasen säga nej.
    db.add(User(username="Vendela", password_hash="x"))
    db.commit()
    db.add(User(username="vendela", password_hash="x"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_login_is_not_case_sensitive(client):
    _register(client, username="Vendela")
    response = client.post("/users/login", json={"username": "VENDELA", "password": "hemligt123"})
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "Vendela"  # ursprungligt skiftläge bevaras


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "email": "a@example.com", "password": "hemligt123"},       # för kort användarnamn
        {"username": "x" * 51, "email": "a@example.com", "password": "hemligt123"},   # för långt användarnamn
        {"username": "vendela", "email": "a@example.com", "password": "kort"},        # för kort lösenord
        {"username": "vendela", "email": "a@example.com"},                           # lösenord saknas
        {"username": "vendela", "password": "hemligt123"},                           # e-post saknas
        {"username": "vendela", "email": "", "password": "hemligt123"},              # tom e-post
        {"username": "vendela", "email": "inte-en-epost", "password": "hemligt123"},  # saknar @
        {"username": "vendela", "email": "a@", "password": "hemligt123"},            # saknar domän
        {"username": "vendela", "email": "a b@example.com", "password": "hemligt123"},  # mellanslag
    ],
)
def test_register_validates_input(client, payload):
    assert client.post("/users/register", json=payload).status_code == 422


def test_register_invalid_email_gives_swedish_message(client):
    response = _register(client, email="inte-en-epost")
    assert response.status_code == 422
    assert "Ogiltig e-postadress" in response.json()["detail"][0]["msg"]


def test_verify_password():
    password_hash = hash_password("hemligt123")
    assert verify_password("hemligt123", password_hash)
    assert not verify_password("fel-lösenord", password_hash)
    assert not verify_password("hemligt123", "")  # ogiltig hash ger False, inte krasch


# --- Lägga till e-post i efterhand (PUT /users/me/email) ---
# Konton som skapades innan e-post krävdes saknar den. `user`-fixturen är ett
# sådant konto (ingen e-post). Att andra aldrig ser e-posten täcks redan av
# testerna som kontrollerar exakt vilka fält som skickas ut om andra
# (test_user_profile.py, test_people.py).


def test_me_shows_own_email_as_none_when_missing(client, user):
    response = client.get("/users/me")
    assert response.status_code == 200
    assert response.json()["email"] is None


def test_add_email_saves_it_in_lowercase(client, db, user):
    response = client.put("/users/me/email", json={"email": "  Test@Example.COM "})
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"
    db.refresh(user)
    assert user.email == "test@example.com"
    # Och /users/me visar den nu.
    assert client.get("/users/me").json()["email"] == "test@example.com"


def test_add_email_rejects_invalid_address_in_swedish(client, db, user):
    response = client.put("/users/me/email", json={"email": "inte-en-epost"})
    assert response.status_code == 422
    assert "Ogiltig e-postadress" in response.json()["detail"][0]["msg"]
    db.refresh(user)
    assert user.email is None


def test_add_email_rejects_address_taken_by_someone_else(client, db, user):
    db.add(User(username="annan", email="upptagen@example.com", password_hash="x"))
    db.commit()
    # Andra stora/små bokstäver är samma adress.
    response = client.put("/users/me/email", json={"email": "Upptagen@Example.com"})
    assert response.status_code == 409
    assert response.json()["detail"] == "E-postadressen används redan."
    db.refresh(user)
    assert user.email is None


def test_add_email_cannot_change_existing_email(client, db, user):
    user.email = "forsta@example.com"
    db.commit()
    response = client.put("/users/me/email", json={"email": "andra@example.com"})
    assert response.status_code == 409
    assert response.json()["detail"] == "Du har redan en e-postadress."
    db.refresh(user)
    assert user.email == "forsta@example.com"
