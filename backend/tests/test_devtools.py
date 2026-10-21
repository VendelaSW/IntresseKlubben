"""Testläget (app/devtools): att det aldrig finns i den vanliga appen, att det vägrar starta mot en riktig databas
eller på Vercel, och att testdatan och scenarierna fortfarande går igenom appens API (så att de inte tyst går
sönder när appen ändras)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.crud.interest_library import load_library, sync_library
from app.db.session import get_db
from app.devtools import UnsafeDevMode, assert_safe, fake_ai
from app.devtools.routes import router as devtools_router
from app.devtools.seed import ACCOUNTS, seed
from app.main import app
from app.models import Interest, Municipality, User


def test_the_normal_app_has_no_dev_routes(client):
    assert not [path for path in app.openapi()["paths"] if path.startswith("/dev")]
    assert client.post("/dev/login", json={"username": "anna"}).status_code == 404


def test_refuses_a_real_database(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "postgresql://user:pw@neon.example/db")
    with pytest.raises(UnsafeDevMode):
        assert_safe()


def test_refuses_vercel(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "sqlite://")
    monkeypatch.setattr(settings, "vercel_env", "preview")
    with pytest.raises(UnsafeDevMode):
        assert_safe()


def test_allows_sqlite_locally(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "sqlite://")
    monkeypatch.setattr(settings, "vercel_env", "")
    assert_safe()


@pytest.fixture
def seeded(db, client, profile_lock):
    """Databasen som testläget bygger: biblioteket, kommunerna, fejkad AI och testdatan. Låset för profil är på,
    som i den riktiga appen."""
    sync_library(db, load_library())
    db.add_all([Municipality(code=code, name=name) for code, name in [("1480", "Göteborg"), ("1481", "Mölndal"),
                                                                      ("0180", "Stockholm")]])
    db.commit()
    fake_ai.install([name for (name,) in db.query(Interest.name).all()])
    return seed(app, db)


@pytest.fixture
def dev_client(db):
    """Testlägets egna adresser, i en egen app så att den vanliga appen aldrig får dem."""
    dev_app = FastAPI()
    dev_app.include_router(devtools_router)
    dev_app.dependency_overrides[get_db] = lambda: db
    return TestClient(dev_app)


def test_seed_creates_every_account_with_verified_email(seeded, db):
    assert set(seeded) == {account["username"] for account in ACCOUNTS}
    assert all(user.email_verified for user in db.query(User).all())


def test_seed_gives_anna_something_of_everything(seeded, client, dev_client):
    token = dev_client.post("/dev/login", json={"username": "anna"}).json()["access_token"]
    badges = client.get("/users/me/badges", headers={"Authorization": f"Bearer {token}"}).json()
    assert badges["contact_requests"] == 1
    assert badges["club_invitations"] == 1
    assert badges["event_invitations"] == 2
    assert badges["unread_conversations"] == 2


def test_accounts_lists_the_test_accounts(seeded, dev_client):
    accounts = dev_client.get("/dev/accounts").json()
    assert [a["username"] for a in accounts] == [account["username"] for account in ACCOUNTS]


def test_login_as_unknown_account_is_404(seeded, dev_client):
    assert dev_client.post("/dev/login", json={"username": "finnsinte"}).status_code == 404


@pytest.mark.parametrize(
    "scenario, badge",
    [
        ("kontaktforfragan", "contact_requests"),
        ("brev", "unread_conversations"),
        ("klubbinbjudan", "club_invitations"),
        ("eventinbjudan", "event_invitations"),
    ],
)
def test_scenario_gives_the_logged_in_user_one_more(seeded, client, dev_client, scenario, badge):
    token = dev_client.post("/dev/login", json={"username": "nils"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    before = client.get("/users/me/badges", headers=headers).json()[badge]
    assert dev_client.post(f"/dev/scenarios/{scenario}", headers=headers).status_code == 200
    assert client.get("/users/me/badges", headers=headers).json()[badge] == before + 1


def test_unknown_scenario_is_404(seeded, dev_client):
    token = dev_client.post("/dev/login", json={"username": "nils"}).json()["access_token"]
    response = dev_client.post("/dev/scenarios/finnsinte", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 404


# ---------- Den fejkade AI:n (app/devtools/fake_ai.py) ----------
# Mot appens riktiga steg, så att testet säger till om ett meddelandeformat ändras och testläget slutar fungera.


@pytest.fixture
def library_with_fake_ai(db):
    sync_library(db, load_library())
    db.commit()
    fake_ai.install([name for (name,) in db.query(Interest.name).all()])
    from app.crud.interest import load_library_index

    return load_library_index(db)


def test_fake_ai_puts_a_new_interest_under_the_catch_all_area(library_with_fake_ai):
    from app.services.interest_matching import Tag, match_tags

    [match] = match_tags([Tag("t1", "modelljärnvägar")], library_with_fake_ai)
    assert match.kind == "new"
    assert library_with_fake_ai.by_id[match.parent_id].name == fake_ai.NEW_INTEREST_AREA


def test_fake_ai_rejects_when_the_reject_word_is_written(library_with_fake_ai):
    from app.services.interest_extractor import judge_tags
    from app.services.text_policy import TextNotAllowed, check_text

    assert judge_tags("modelljärnvägar", ["modelljärnvägar"]) == set()
    assert judge_tags(f"{fake_ai.REJECT_WORD} grej", [f"{fake_ai.REJECT_WORD} grej"]) == {f"{fake_ai.REJECT_WORD} grej"}
    check_text("Jag är glad och nyfiken.")
    with pytest.raises(TextNotAllowed):
        check_text(f"Det här {fake_ai.REJECT_WORD}.")
