"""Tester för moderering (SCRUM-131): GET /moderation/reports, att markera
anmälningar som hanterade, avstängningar (PUT/DELETE /moderation/users/{id}/suspension),
att en avstängd inte kan logga in eller använda appen, och make_moderator."""

from datetime import timedelta

import pytest

from app.auth.security import get_current_user, hash_password
from app.crud.moderation import suspend_user
from app.crud.user import delete_user
from app.main import app
from app.make_moderator import run as make_moderator
from app.models import Report, Suspension, User
from app.models.email_token import utc_now
from tests.helpers import make_profile


@pytest.fixture
def moderator(db, user):
    user.is_moderator = True
    db.add(make_profile(user.id, name="Moa"))
    db.commit()
    return user


@pytest.fixture
def bob(db):
    other = User(id=2, username="bob", password_hash=hash_password("hemligt123"))
    db.add(other)
    db.commit()
    db.add(make_profile(other.id, name="Bob"))
    db.commit()
    return other


@pytest.fixture
def anna(db):
    other = User(id=3, username="anna", password_hash="unused")
    db.add(other)
    db.commit()
    db.add(make_profile(other.id, name="Anna"))
    db.commit()
    return other


def _login_as(other: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: other


def _report(db, reporter, reported, **fields):
    report = Report(
        reporter_id=reporter.id, reported_user_id=reported.id, target_type="profile", reason="harassment", **fields
    )
    db.add(report)
    db.commit()
    return report


def test_only_moderators_get_in(client, db, user, bob):
    for request in (
        client.get("/moderation/reports"),
        client.post("/moderation/reports/1/handled"),
        client.put(f"/moderation/users/{bob.id}/suspension", json={"days": 1, "reason": "spam"}),
        client.delete(f"/moderation/users/{bob.id}/suspension"),
    ):
        assert request.status_code == 403
        assert request.json()["detail"] == "Bara moderatorer kommer åt det här"


def test_list_new_reports_with_history(client, db, moderator, bob, anna):
    _report(db, anna, bob, comment="Elak")
    _report(db, anna, bob)
    suspend_user(db, bob.id, 7, "harassment", moderator.id)
    db.query(Suspension).update({Suspension.until: utc_now() - timedelta(days=1)})  # den har gått ut
    db.commit()

    reports = client.get("/moderation/reports").json()
    assert len(reports) == 2
    first = reports[0]
    assert first["reporter"] == {"id": anna.id, "name": "Anna"}
    assert first["reported"]["name"] == "Bob"
    assert first["reported"]["report_count"] == 2
    assert first["reported"]["suspension"] is None
    assert len(first["reported"]["previous_suspensions"]) == 1
    assert client.get("/moderation/reports?handled=true").json() == []


def test_mark_handled_and_back(client, db, moderator, bob, anna):
    report = _report(db, anna, bob)

    assert client.post(f"/moderation/reports/{report.id}/handled").status_code == 204
    assert client.get("/moderation/reports").json() == []
    handled = client.get("/moderation/reports?handled=true").json()
    assert [(r["id"], r["handled_by"]) for r in handled] == [(report.id, "Moa")]
    assert db.get(Report, report.id).status == "handled"

    assert client.delete(f"/moderation/reports/{report.id}/handled").status_code == 204
    assert [r["id"] for r in client.get("/moderation/reports").json()] == [report.id]
    assert client.post("/moderation/reports/999/handled").status_code == 404


@pytest.mark.parametrize("days", [1, 7, 30, None])
def test_suspend_for_a_while_or_until_further_notice(client, db, moderator, bob, days):
    response = client.put(f"/moderation/users/{bob.id}/suspension", json={"days": days, "reason": "harassment"})
    assert response.status_code == 200
    suspension = db.query(Suspension).one()
    assert (suspension.user_id, suspension.created_by, suspension.reason) == (bob.id, moderator.id, "harassment")
    assert (suspension.until is None) == (days is None)


@pytest.mark.parametrize("body", [{"days": 3, "reason": "spam"}, {"days": 1, "reason": "boring"}])
def test_invalid_suspension_gives_422(client, moderator, bob, body):
    assert client.put(f"/moderation/users/{bob.id}/suspension", json=body).status_code == 422


def test_cannot_suspend_yourself_or_unknown(client, moderator):
    response = client.put(f"/moderation/users/{moderator.id}/suspension", json={"days": 1, "reason": "spam"})
    assert response.status_code == 400
    assert client.put("/moderation/users/999/suspension", json={"days": 1, "reason": "spam"}).status_code == 404


def test_new_suspension_replaces_the_current_one(client, db, moderator, bob):
    client.put(f"/moderation/users/{bob.id}/suspension", json={"days": 1, "reason": "spam"})
    client.put(f"/moderation/users/{bob.id}/suspension", json={"days": None, "reason": "harassment"})
    rows = db.query(Suspension).order_by(Suspension.id).all()
    assert [(s.lifted_at is not None, s.until is None) for s in rows] == [(True, False), (False, True)]


def test_lift_suspension(client, db, moderator, bob):
    client.put(f"/moderation/users/{bob.id}/suspension", json={"days": 30, "reason": "spam"})
    assert client.delete(f"/moderation/users/{bob.id}/suspension").status_code == 204
    assert db.query(Suspension).one().lifted_by == moderator.id


def test_suspended_user_cannot_log_in(client, db, moderator, bob):
    suspend_user(db, bob.id, 7, "spam", moderator.id)
    app.dependency_overrides.pop(get_current_user)

    response = client.post("/users/login", json={"username_or_email": "bob", "password": "hemligt123"})
    assert response.status_code == 403
    assert response.json()["detail"].startswith("Ditt konto är avstängt till ")

    db.query(Suspension).update({Suspension.until: None})
    db.commit()
    response = client.post("/users/login", json={"username_or_email": "bob", "password": "hemligt123"})
    assert response.json()["detail"] == "Ditt konto är avstängt tills vidare."


def test_suspended_user_is_logged_out_and_can_log_in_after(client, db, moderator, bob):
    app.dependency_overrides.pop(get_current_user)
    token = client.post("/users/login", json={"username_or_email": "bob", "password": "hemligt123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/users/me", headers=headers).status_code == 200

    suspension = suspend_user(db, bob.id, 1, "spam", moderator.id)
    response = client.get("/users/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "Ditt konto är avstängt"

    # När tiden har gått ut gäller den inte längre.
    suspension.until = utc_now() - timedelta(minutes=1)
    db.commit()
    assert client.get("/users/me", headers=headers).status_code == 200


def test_suspended_users_are_hidden_from_people(client, db, moderator, bob, anna):
    suspend_user(db, bob.id, 7, "spam", moderator.id)
    assert [p["name"] for p in client.get("/users/").json()] == ["Anna"]


def test_me_says_if_you_are_moderator(client, moderator):
    assert client.get("/users/me").json()["is_moderator"] is True


def test_deleting_accounts_cleans_up_moderation(client, db, moderator, bob, anna):
    report = _report(db, anna, bob)
    client.post(f"/moderation/reports/{report.id}/handled")
    suspend_user(db, bob.id, 7, "spam", moderator.id)

    delete_user(db, db.get(User, moderator.id))
    assert db.get(Report, report.id).handled_by is None
    assert db.query(Suspension).one().created_by is None

    delete_user(db, db.get(User, bob.id))
    assert db.query(Suspension).count() == 0


def test_make_moderator(db, bob):
    assert make_moderator(db, "bob") == (True, "bob är nu moderator.")
    assert db.get(User, bob.id).is_moderator is True
    assert make_moderator(db, "bob", remove=True) == (True, "bob är inte längre moderator.")
    assert db.get(User, bob.id).is_moderator is False
    assert make_moderator(db, "finns-inte")[0] is False
