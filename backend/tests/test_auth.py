"""Tester för inloggning med token.

Här används riktiga token hela vägen (inte genvägen i fixturen `user`),
så att själva inloggningen testas: POST /users/login → token → anrop med
"Authorization: Bearer <token>".
"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.auth.security import TOKEN_ALGORITHM
from app.core.config import settings
from app.models.interest import Interest
from tests.helpers import profile_payload

PASSWORD = "hemligt123"


def _register_and_login(client, username):
    client.post("/users/register", json={"username": username, "email": f"{username}@example.com", "password": PASSWORD})
    response = client.post("/users/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _token(payload, secret=None):
    return jwt.encode(payload, secret or settings.jwt_secret, algorithm=TOKEN_ALGORITHM)


def test_login_returns_token_and_user_without_password(client):
    client.post("/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": PASSWORD})
    response = client.post("/users/login", json={"username": "vendela", "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["username"] == "vendela"
    assert "password" not in str(body).lower()


def test_token_identifies_the_logged_in_user(client):
    token = _register_and_login(client, "vendela")
    response = client.get("/users/me", headers=_auth(token))
    assert response.status_code == 200
    assert response.json()["username"] == "vendela"


def test_wrong_password_and_unknown_user_give_the_same_error(client):
    client.post("/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": PASSWORD})
    wrong_password = client.post("/users/login", json={"username": "vendela", "password": "fel-lösenord"})
    unknown_user = client.post("/users/login", json={"username": "finnsinte", "password": PASSWORD})

    for response in (wrong_password, unknown_user):
        assert response.status_code == 401
        assert response.json()["detail"] == "Fel användarnamn eller lösenord."


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/users/me"),
        ("get", "/profile/"),
        ("patch", "/profile/"),
        ("get", "/profile/interests"),
        ("post", "/profile/image/upload-url"),
    ],
)
def test_protected_routes_require_login(client, method, path):
    kwargs = {"json": {}} if method in ("patch", "post") else {}
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


@pytest.mark.parametrize(
    "make_token",
    [
        lambda: "inte-en-token",
        lambda: _token({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(days=1)}, secret="annan-nyckel-" * 3),
        lambda: _token({"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}),
        lambda: _token({"sub": "999", "exp": datetime.now(timezone.utc) + timedelta(days=1)}),
        lambda: _token({"exp": datetime.now(timezone.utc) + timedelta(days=1)}),
    ],
    ids=["garbage", "wrong-secret", "expired", "user-does-not-exist", "no-user-in-token"],
)
def test_invalid_tokens_are_rejected(client, make_token):
    _register_and_login(client, "vendela")  # användare med id 1 finns
    response = client.get("/users/me", headers=_auth(make_token()))
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


def test_each_user_gets_their_own_profile(client, db, municipalities):
    """Det här var buggen: alla hamnade på användare 1 oavsett inloggning."""
    alice = _register_and_login(client, "alice")
    bob = _register_and_login(client, "bob")
    interest = Interest(name="Yoga")
    db.add(interest)
    db.commit()

    client.post("/profile/", json=profile_payload([interest.id], name="Bob"), headers=_auth(bob))
    client.post("/profile/", json=profile_payload([interest.id], name="Alice"), headers=_auth(alice))

    assert client.get("/profile/", headers=_auth(bob)).json()["name"] == "Bob"
    assert client.get("/profile/", headers=_auth(alice)).json()["name"] == "Alice"


def test_login_gives_clear_error_when_secret_is_missing(client, monkeypatch):
    client.post("/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": PASSWORD})
    monkeypatch.setattr(settings, "jwt_secret", "")
    response = client.post("/users/login", json={"username": "vendela", "password": PASSWORD})
    assert response.status_code == 503
    assert response.json()["detail"] == "Inloggning är inte konfigurerad på servern."
