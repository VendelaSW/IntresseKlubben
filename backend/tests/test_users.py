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
