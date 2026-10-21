"""Tester för anmälningar: POST /reports, och att anmälningarna finns kvar utan
koppling till kontot när ett konto raderas."""

from datetime import timedelta

import pytest

from app.auth.security import get_current_user
from app.crud.user import delete_user
from app.main import app
from app.models.email_token import utc_now
from app.crud.report import REPORTS_PER_HOUR
from app.models import GroupMessage, GroupPost, Interest, Message, Report, User


@pytest.fixture
def bob(db):
    other = User(id=2, username="bob", password_hash="unused")
    db.add(other)
    db.commit()
    return other


@pytest.fixture
def outsider(db):
    other = User(id=3, username="outsider", password_hash="unused")
    db.add(other)
    db.commit()
    return other


@pytest.fixture
def group(client, db, user, bob, municipalities):
    """En öppen klubb som `user` äger och `bob` är med i."""
    interest = Interest(name="Löpning")
    db.add(interest)
    db.commit()
    created = client.post("/groups/", json={
        "name": "Morgonlöparna",
        "description": "Lugna rundor före jobbet.",
        "interest_id": interest.id,
        "municipality_code": "1480",
    }).json()
    _login_as(bob)
    assert client.put(f"/groups/{created['id']}/members/me").status_code == 200
    _login_as(user)
    return created


def _login_as(other: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: other


def _report(client, target_type, target_id, reason="harassment", comment=None):
    return client.post("/reports", json={
        "target_type": target_type, "target_id": target_id, "reason": reason, "comment": comment,
    })


def test_report_a_profile(client, db, user, bob):
    response = _report(client, "profile", bob.id, reason="fake_profile", comment="  Låtsas vara någon annan.  ")
    assert response.status_code == 201

    report = db.get(Report, response.json()["id"])
    assert (report.reporter_id, report.reported_user_id) == (user.id, bob.id)
    assert (report.target_type, report.target_id, report.content) == ("profile", None, None)
    assert (report.reason, report.comment, report.status) == ("fake_profile", "Låtsas vara någon annan.", "new")


def test_report_a_received_letter_keeps_a_copy(client, db, user, bob):
    letter = Message(sender_id=bob.id, recipient_id=user.id, text="Elakt brev")
    db.add(letter)
    db.commit()

    response = _report(client, "message", letter.id)
    assert response.status_code == 201
    report = db.get(Report, response.json()["id"])
    assert (report.reported_user_id, report.target_id, report.content) == (bob.id, letter.id, "Elakt brev")

    # Kopian finns kvar även om brevet tas bort.
    db.delete(letter)
    db.commit()
    assert db.get(Report, report.id).content == "Elakt brev"


def test_cannot_report_someone_elses_letter(client, db, user, bob, outsider):
    letter = Message(sender_id=bob.id, recipient_id=outsider.id, text="Hej")
    db.add(letter)
    db.commit()

    response = _report(client, "message", letter.id)
    assert response.status_code == 404
    assert db.query(Report).count() == 0


def test_report_a_club_chat_message_and_a_note(client, db, user, bob, group):
    chat = GroupMessage(group_id=group["id"], sender_id=bob.id, content="Elakt i chatten")
    note = GroupPost(group_id=group["id"], author_id=bob.id, content="Elak lapp")
    db.add_all([chat, note])
    db.commit()

    assert _report(client, "group_message", chat.id, reason="inappropriate").status_code == 201
    assert _report(client, "group_post", note.id, reason="spam").status_code == 201
    assert [(r.target_type, r.content, r.reported_user_id) for r in db.query(Report).order_by(Report.id)] == [
        ("group_message", "Elakt i chatten", bob.id),
        ("group_post", "Elak lapp", bob.id),
    ]


def test_non_member_cannot_report_club_content(client, db, user, bob, outsider, group):
    chat = GroupMessage(group_id=group["id"], sender_id=bob.id, content="Hej")
    note = GroupPost(group_id=group["id"], author_id=bob.id, content="Lapp")
    db.add_all([chat, note])
    db.commit()
    _login_as(outsider)

    assert _report(client, "group_message", chat.id).status_code == 404
    assert _report(client, "group_post", note.id).status_code == 404
    assert db.query(Report).count() == 0


def test_cannot_report_yourself_or_your_own_content(client, db, user, bob, group):
    note = GroupPost(group_id=group["id"], author_id=user.id, content="Min lapp")
    db.add(note)
    db.commit()

    response = _report(client, "profile", user.id)
    assert response.status_code == 400
    assert response.json()["detail"] == "Du kan inte anmäla dig själv"
    assert _report(client, "group_post", note.id).status_code == 400


@pytest.mark.parametrize("target_type", ["profile", "message", "group_message", "group_post"])
def test_unknown_target_gives_404(client, user, target_type):
    response = _report(client, target_type, 9999)
    assert response.status_code == 404
    assert response.json()["detail"] == "Det du vill anmäla finns inte längre"


@pytest.mark.parametrize("body", [
    {"target_type": "profile", "target_id": 2, "reason": "boring"},
    {"target_type": "event", "target_id": 2, "reason": "spam"},
    {"target_type": "profile", "target_id": 2},
])
def test_invalid_report_gives_422(client, user, bob, body):
    assert client.post("/reports", json=body).status_code == 422


def test_too_long_comment_gives_422(client, user, bob):
    response = _report(client, "profile", bob.id, comment="x" * 501)
    assert response.status_code == 422
    assert "max vara 500" in str(response.json()["detail"])


def test_reports_stay_without_the_deleted_account(client, db, user, bob, outsider):
    _report(client, "profile", bob.id)  # user anmäler bob
    _login_as(bob)
    _report(client, "profile", outsider.id)  # bob anmäler outsider

    delete_user(db, db.get(User, bob.id))

    reports = db.query(Report).order_by(Report.id).all()
    assert [(r.reporter_id, r.reported_user_id) for r in reports] == [(user.id, None), (None, outsider.id)]


def test_same_thing_can_only_be_reported_once_until_handled(client, db, user, bob):
    letter = Message(sender_id=bob.id, recipient_id=user.id, text="Elakt brev")
    db.add(letter)
    db.commit()
    assert _report(client, "message", letter.id).status_code == 201
    assert _report(client, "profile", bob.id).status_code == 201  # profilen är en annan sak

    for target_type, target_id in (("message", letter.id), ("profile", bob.id)):
        response = _report(client, target_type, target_id, reason="spam")
        assert response.status_code == 409
        assert response.json()["detail"] == "Du har redan anmält det här. Vi tittar på det."
    assert db.query(Report).count() == 2

    # När anmälan är hanterad går det att anmäla igen.
    db.query(Report).update({Report.handled_at: utc_now()})
    db.commit()
    assert _report(client, "profile", bob.id).status_code == 201


def test_at_most_a_few_reports_per_hour(client, db, user):
    people = [User(id=10 + i, username=f"person{i}", password_hash="unused") for i in range(REPORTS_PER_HOUR + 1)]
    db.add_all(people)
    db.commit()
    for person in people[:REPORTS_PER_HOUR]:
        assert _report(client, "profile", person.id).status_code == 201

    response = _report(client, "profile", people[-1].id)
    assert response.status_code == 429
    assert "många saker på kort tid" in response.json()["detail"]

    # Anmälningar äldre än en timme räknas inte.
    db.query(Report).update({Report.created_at: utc_now() - timedelta(hours=2)})
    db.commit()
    assert _report(client, "profile", people[-1].id).status_code == 201
