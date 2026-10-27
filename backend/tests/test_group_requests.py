"""Klubbar man ansöker till (SCRUM-159): ansöka, ta tillbaka, godkänna och neka, med notiser."""

import pytest

from app.auth.security import get_current_user
from app.crud.group import MAX_MEMBERSHIPS
from app.main import app
from app.models import Group, GroupJoinRequest, GroupMember, Interest, Notification, User
from app.models.group import GroupRole, GroupVisibility
from tests.event_helpers import add_contact
from tests.helpers import make_profile


@pytest.fixture
def people(db, user, municipalities):
    """Ägaren Olle (2) och Sara (3), som ansöker. Testet börjar inloggat som `user` (1)."""
    found = {}
    for user_id, name in [(2, "Olle"), (3, "Sara")]:
        person = User(id=user_id, username=name.lower(), password_hash="x")
        db.add(person)
        db.flush()
        db.add(make_profile(user_id, name=name))
        found[name] = person
    db.commit()
    return found


@pytest.fixture
def club(db, people):
    interest = Interest(name="Schack")
    db.add(interest)
    db.flush()
    group = Group(
        name="Schackklubben", description="d", interest_id=interest.id, municipality_code="1480",
        visibility=GroupVisibility.application, members=[GroupMember(user_id=2, role=GroupRole.owner)],
    )
    db.add(group)
    db.commit()
    return group


def login(person):
    app.dependency_overrides[get_current_user] = lambda: person


def _apply(client, club, message=None):
    return client.put(f"/groups/{club.id}/requests/me", json={"message": message})


def _notes(db, user_id):
    return [(n.kind, n.title, n.quote) for n in db.query(Notification).filter_by(user_id=user_id).order_by(Notification.id)]


def test_an_application_club_is_listed_but_cannot_be_joined_directly(client, club, people):
    login(people["Sara"])
    assert [g["visibility"] for g in client.get("/groups/").json()] == ["application"]
    response = client.put(f"/groups/{club.id}/members/me")
    assert response.status_code == 409
    assert response.json()["detail"] == "Du behöver ansöka för att gå med i klubben"


def test_applying_notifies_the_owner_with_the_message(client, db, club, people):
    login(people["Sara"])
    body = _apply(client, club, "  Jag har spelat i tio år!  ").json()
    assert body["has_applied"] is True and body["is_member"] is False
    assert _notes(db, 2) == [("group_join_request", "Sara vill gå med i Schackklubben", "Jag har spelat i tio år!")]


def test_applying_twice_keeps_one_application_and_one_notification(client, db, club, people):
    login(people["Sara"])
    _apply(client, club)
    _apply(client, club, "igen")
    assert db.query(GroupJoinRequest).count() == 1 and len(_notes(db, 2)) == 1


def test_the_owner_sees_the_applications_and_their_count(client, club, people):
    login(people["Sara"])
    _apply(client, club, "Hej")
    login(people["Olle"])
    assert client.get(f"/groups/{club.id}").json()["request_count"] == 1
    (request,) = client.get(f"/groups/{club.id}/requests").json()
    assert (request["user"]["name"], request["message"]) == ("Sara", "Hej")
    mine = client.get("/groups/overview").json()["mine"]
    assert mine[0]["request_count"] == 1


def test_only_the_owner_sees_and_answers_applications(client, club, people):
    login(people["Sara"])
    _apply(client, club)
    assert client.get(f"/groups/{club.id}").json()["request_count"] == 0
    for method, url in [("get", f"/groups/{club.id}/requests"), ("put", f"/groups/{club.id}/requests/3"),
                        ("delete", f"/groups/{club.id}/requests/3")]:
        assert getattr(client, method)(url).status_code == 403


def test_approving_makes_a_member_and_notifies_the_applicant(client, db, club, people):
    login(people["Sara"])
    _apply(client, club)
    login(people["Olle"])
    assert client.put(f"/groups/{club.id}/requests/3").status_code == 204
    login(people["Sara"])
    body = client.get(f"/groups/{club.id}").json()
    assert body["is_member"] is True and body["has_applied"] is False
    assert _notes(db, 3) == [("group_request_approved", "Du är med i Schackklubben!", None)]


def test_declining_notifies_and_lets_the_applicant_apply_again(client, db, club, people):
    login(people["Sara"])
    _apply(client, club)
    login(people["Olle"])
    assert client.delete(f"/groups/{club.id}/requests/3").status_code == 204
    assert _notes(db, 3) == [("group_request_declined", "Din ansökan till Schackklubben fick nej", None)]
    login(people["Sara"])
    assert client.get(f"/groups/{club.id}").json()["has_applied"] is False
    assert _apply(client, club).json()["has_applied"] is True


def test_answering_a_missing_application_is_an_error(client, club, people):
    login(people["Olle"])
    response = client.put(f"/groups/{club.id}/requests/3")
    assert response.status_code == 409
    assert response.json()["detail"] == "Ansökan finns inte"


def test_withdrawing_removes_the_application(client, db, club, people):
    login(people["Sara"])
    _apply(client, club)
    assert client.delete(f"/groups/{club.id}/requests/me").json()["has_applied"] is False
    assert db.query(GroupJoinRequest).count() == 0
    assert client.delete(f"/groups/{club.id}/requests/me").status_code == 200  # går att upprepa


def test_an_invitation_lets_you_join_without_applying(client, db, club, people):
    add_contact(db, 2, 3)
    login(people["Olle"])
    client.post(f"/groups/{club.id}/invitations", json={"user_ids": [3]})
    login(people["Sara"])
    assert client.put(f"/groups/{club.id}/members/me").json()["is_member"] is True


def test_joining_by_invitation_also_clears_a_pending_application(client, db, club, people):
    add_contact(db, 2, 3)
    login(people["Sara"])
    _apply(client, club)
    login(people["Olle"])
    client.post(f"/groups/{club.id}/invitations", json={"user_ids": [3]})
    login(people["Sara"])
    client.put(f"/groups/{club.id}/members/me")
    assert db.query(GroupJoinRequest).count() == 0


def test_a_full_club_takes_no_applications_and_cannot_approve(client, db, club, people):
    login(people["Sara"])
    _apply(client, club)
    club.max_members = 1
    db.commit()
    login(people["Olle"])
    response = client.put(f"/groups/{club.id}/requests/3")
    assert response.status_code == 409 and response.json()["detail"] == "Klubben är full"
    login(people["Sara"])
    db.query(GroupJoinRequest).delete()
    db.commit()
    assert _apply(client, club).json()["detail"] == "Klubben är full"


def test_an_open_club_takes_no_applications(client, db, club, people):
    club.visibility = GroupVisibility.public
    db.commit()
    login(people["Sara"])
    response = _apply(client, club)
    assert response.status_code == 409
    assert response.json()["detail"] == "Den här klubben tar inte emot ansökningar"


def test_an_applicant_at_the_membership_limit_cannot_be_approved(client, db, club, people):
    login(people["Sara"])
    _apply(client, club)
    interest_id = club.interest_id
    db.add_all(
        Group(name=f"Klubb {i}", description="d", interest_id=interest_id, municipality_code="1481",
              members=[GroupMember(user_id=3, role=GroupRole.owner)])
        for i in range(MAX_MEMBERSHIPS)
    )
    db.commit()
    login(people["Olle"])
    response = client.put(f"/groups/{club.id}/requests/3")
    assert response.status_code == 409
    assert response.json()["detail"] == "Personen är redan med i så många klubbar som går"


def test_a_blocked_applicant_is_silently_not_sent_to_the_owner(client, db, club, people):
    add_contact(db, 2, 3, status="BLOCKED")
    login(people["Sara"])
    assert _apply(client, club).status_code == 200  # inget fel som avslöjar blockeringen
    assert db.query(GroupJoinRequest).count() == 0 and _notes(db, 2) == []


def test_a_rude_message_is_stopped(client, club, people):
    login(people["Sara"])
    response = _apply(client, club, "Fuck you")
    assert response.status_code == 422


def test_a_too_long_message_is_rejected(client, club, people):
    login(people["Sara"])
    response = _apply(client, club, "x" * 201)
    assert response.status_code == 422
    assert "Meddelandet får max vara 200 tecken" in str(response.json())


def test_deleting_the_account_removes_its_applications(client, db, club, people):
    from app.crud.user import delete_user

    login(people["Sara"])
    _apply(client, club)
    delete_user(db, db.get(User, 3))
    db.commit()
    assert db.query(GroupJoinRequest).count() == 0
