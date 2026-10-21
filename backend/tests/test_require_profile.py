"""Tester för att resten av appen är låst tills profilen är klar (require_profile).

Låset är avstängt som standard i testerna (se conftest.py), så varje test här
ber om fixturen `profile_lock` för att slå på det igen.
"""

import re

import pytest

from app.core import error_messages as msg
from tests.helpers import make_profile, profile_payload
from tests.test_app_structure import _registered_routes

# Det som behövs för att bli klar med kontot och profilen, och därför är öppet
# utan profil: inloggning, det egna kontot, den egna profilen och biblioteken.
# Allt annat ska vara låst. Lägg bara till här om endpointen verkligen behövs
# innan profilen finns, och skriv i PR:en varför.
OPEN_WITHOUT_PROFILE = {
    ("POST", "/users/register"),
    ("POST", "/users/login"),
    ("GET", "/users/me"),
    ("PATCH", "/users/me"),
    ("DELETE", "/users/me"),
    ("GET", "/users/me/availability"),
    ("POST", "/users/me/email-verification"),
    ("POST", "/users/verify-email"),
    ("POST", "/users/forgot-password"),
    ("POST", "/users/reset-password"),
    ("POST", "/users/me/password"),
    ("POST", "/users/confirm-password-change"),
}
OPEN_PATH_PREFIXES = ("/health", "/profile", "/interests", "/municipalities")


def _is_open(method, path):
    return (method, path) in OPEN_WITHOUT_PROFILE or path.startswith(OPEN_PATH_PREFIXES)


def _locked_endpoints():
    return sorted((m, p) for p, m in _registered_routes() if not _is_open(m, p))


@pytest.mark.parametrize(("method", "path"), _locked_endpoints(), ids=lambda v: v)
def test_endpoint_is_locked_without_a_profile(client, user, profile_lock, method, path):
    """Alla endpoints utom de öppna ska svara 403 för en inloggad användare utan
    profil. Fångar en ny route som glömt låset, så att man inte kan nå appen via
    en annan endpoint. Sökvägsparametrar fylls med ett påhittat värde, eftersom
    låset kontrolleras innan något slås upp."""
    url = re.sub(r"\{[^}]+\}", "1", path)
    kwargs = {"json": {}} if method in ("POST", "PUT", "PATCH") else {}
    response = client.request(method, url, **kwargs)
    assert response.status_code == 403, (
        f"{method} {path} svarade {response.status_code} utan profil. Lägg till "
        "dependencies=[Depends(require_profile)] (på routern eller endpointen), eller "
        "lägg endpointen i OPEN_WITHOUT_PROFILE om den behövs innan profilen finns."
    )
    assert response.json()["detail"] == msg.PROFILE_REQUIRED


def test_open_list_is_up_to_date():
    """Upptäcker om en öppen endpoint har tagits bort eller bytt namn, så att
    listan inte släpper igenom en ny endpoint med samma gamla adress."""
    missing = OPEN_WITHOUT_PROFILE - {(m, p) for p, m in _registered_routes()}
    assert not missing, f"Finns i OPEN_WITHOUT_PROFILE men inte i appen: {sorted(missing)}"


def test_what_is_needed_to_finish_works_without_a_profile(client, db, user, profile_lock, municipalities):
    me = client.get("/users/me")
    assert me.status_code == 200
    assert me.json()["profile_completed"] is False
    assert client.get("/interests/").status_code == 200
    assert client.get("/municipalities/").status_code == 200
    assert client.get("/profile/").status_code == 404  # ingen profil än, men ingen 403


def test_creating_the_profile_unlocks_the_app(client, db, user, profile_lock, municipalities):
    from app.models import Interest

    interest = Interest(name="Löpning")
    db.add(interest)
    db.commit()
    assert client.get("/users/").status_code == 403

    created = client.post("/profile/", json=profile_payload([interest.id]))
    assert created.status_code == 201

    assert client.get("/users/").status_code == 200
    assert client.get("/users/me").json()["profile_completed"] is True


def test_login_says_whether_the_profile_is_done_and_the_token_is_locked_until_then(client, db, profile_lock):
    # Riktig inloggning med token, inte genvägen i fixturen `user`.
    client.post("/users/register", json={"username": "nykomling", "email": "ny@example.com", "password": "hemligt123"})
    login = client.post("/users/login", json={"username_or_email": "nykomling", "password": "hemligt123"})
    assert login.json()["user"]["profile_completed"] is False
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    locked = client.get("/messages", headers=headers)
    assert locked.status_code == 403
    assert locked.json()["detail"] == msg.PROFILE_REQUIRED

    db.add(make_profile(login.json()["user"]["id"]))
    db.commit()
    assert client.get("/messages", headers=headers).status_code == 200
    relogin = client.post("/users/login", json={"username_or_email": "nykomling", "password": "hemligt123"})
    assert relogin.json()["user"]["profile_completed"] is True
