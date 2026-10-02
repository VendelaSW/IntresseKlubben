import pytest

from app.auth.security import hash_password, verify_password
from app.crud.user import get_user_by_username


def test_register_creates_user_without_leaking_password(client, db):
    response = client.post("/users/register", json={"username": "vendela", "password": "hemligt123"})
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "vendela"
    assert set(body) == {"id", "username", "created_at"}

    stored = get_user_by_username(db, "vendela")
    assert stored.password_hash != "hemligt123"
    assert verify_password("hemligt123", stored.password_hash)


def test_register_rejects_taken_username(client):
    client.post("/users/register", json={"username": "vendela", "password": "hemligt123"})
    response = client.post("/users/register", json={"username": "vendela", "password": "annat12345"})
    assert response.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "password": "hemligt123"},       # för kort användarnamn
        {"username": "x" * 51, "password": "hemligt123"},   # för långt användarnamn
        {"username": "vendela", "password": "kort"},        # för kort lösenord
        {"username": "vendela"},                           # lösenord saknas
    ],
)
def test_register_validates_input(client, payload):
    assert client.post("/users/register", json=payload).status_code == 422


def test_verify_password():
    password_hash = hash_password("hemligt123")
    assert verify_password("hemligt123", password_hash)
    assert not verify_password("fel-lösenord", password_hash)
    assert not verify_password("hemligt123", "")  # ogiltig hash ger False, inte krasch
