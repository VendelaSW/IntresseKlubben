import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Contact, EventInvitation, GroupMember, Interest, User
from app.models.event import EventVisibility
from app.models.group import GroupVisibility
from tests.event_helpers import add_contact, add_event, add_group


@pytest.fixture(autouse=True)
def interest(db):
    row = Interest(id=1, name="Löpning")
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def people(db, user, municipalities):
    """Användare 2–4. testuser (id 1) är skaparen i de flesta testerna."""
    users = [User(id=i, username=f"user{i}", password_hash="unused") for i in (2, 3, 4)]
    db.add_all(users)
    db.commit()
    return {u.username: u for u in users}


@pytest.fixture
def event(db, user, people):
    return add_event(db, user.id, title="Hemligt", visibility=EventVisibility.invite_only)


def login_as(person):
    app.dependency_overrides[get_current_user] = lambda: person


def url(event):
    return f"/events/{event.id}/invitations"


def usernames(response):
    return [u["username"] for u in response.json()]


# ---------- Bjuda in kontakter ----------


def test_creator_invites_a_contact_who_then_sees_the_event(client, db, user, people, event):
    add_contact(db, user.id, people["user2"].id)

    response = client.post(url(event), json={"usernames": ["user2"]})
    assert response.status_code == 200
    assert usernames(response) == ["user2"]

    login_as(people["user2"])
    listed = client.get("/events/").json()
    assert [e["title"] for e in listed] == ["Hemligt"]
    assert listed[0]["is_invited"] is True
    assert listed[0]["is_owner"] is False


def test_creator_is_not_marked_as_invited(client, db, user, people, event):
    assert client.get("/events/").json()[0]["is_invited"] is False


def test_username_lookup_ignores_case(client, db, user, people, event):
    add_contact(db, user.id, people["user2"].id)
    response = client.post(url(event), json={"usernames": ["USER2"]})
    assert response.status_code == 200
    assert usernames(response) == ["user2"]


def test_only_contacts_can_be_invited(client, db, user, people, event):
    add_contact(db, user.id, people["user3"].id, status="PENDING")
    add_contact(db, user.id, people["user4"].id, status="BLOCKED")

    for name in ("user2", "user3", "user4", "okand", "testuser"):
        response = client.post(url(event), json={"usernames": [name]})
        assert response.status_code == 422, name
        # Samma svar för en okänd användare och en som inte är en kontakt.
        assert response.json()["detail"] == "Du kan bara bjuda in dina kontakter"
    assert db.query(EventInvitation).count() == 0


def test_invitations_are_all_or_nothing(client, db, user, people, event):
    add_contact(db, user.id, people["user2"].id)
    response = client.post(url(event), json={"usernames": ["user2", "okand"]})
    assert response.status_code == 422
    assert db.query(EventInvitation).count() == 0


def test_inviting_twice_does_not_duplicate(client, db, user, people, event):
    add_contact(db, user.id, people["user2"].id)
    first = client.post(url(event), json={"usernames": ["user2"]})
    assert usernames(first) == ["user2"]
    # Andra gången är ingen ny inbjuden, så svaret är tomt.
    second = client.post(url(event), json={"usernames": ["user2"]})
    assert second.status_code == 200
    assert usernames(second) == []
    assert usernames(client.get(url(event))) == ["user2"]
    assert db.query(EventInvitation).count() == 1


def test_must_invite_someone(client, db, user, people, event):
    assert client.post(url(event), json={}).status_code == 422
    assert client.post(url(event), json={"usernames": [], "group_ids": []}).status_code == 422


# ---------- Bjuda in en klubb ----------


def test_invite_a_whole_club_skips_creator_and_blocked_users(client, db, user, people, event):
    group = add_group(db, user.id, members=[people["user2"].id, people["user3"].id, people["user4"].id])
    add_contact(db, user.id, people["user3"].id, status="BLOCKED")

    response = client.post(url(event), json={"group_ids": [group.id]})
    assert response.status_code == 200
    assert sorted(usernames(response)) == ["user2", "user4"]


def test_club_members_do_not_need_to_be_contacts(client, db, user, people, event):
    group = add_group(db, user.id, members=[people["user2"].id])
    response = client.post(url(event), json={"group_ids": [group.id]})
    assert usernames(response) == ["user2"]


def test_club_invitation_is_a_snapshot_of_the_members_at_that_time(client, db, user, people, event):
    group = add_group(db, user.id, members=[people["user2"].id])
    client.post(url(event), json={"group_ids": [group.id]})

    db.add(GroupMember(group_id=group.id, user_id=people["user3"].id))
    db.commit()
    assert usernames(client.get(url(event))) == ["user2"]


def test_contacts_and_clubs_can_be_combined(client, db, user, people, event):
    group = add_group(db, user.id, members=[people["user2"].id])
    add_contact(db, user.id, people["user4"].id)
    response = client.post(url(event), json={"usernames": ["user4"], "group_ids": [group.id]})
    assert sorted(usernames(response)) == ["user2", "user4"]


def test_cannot_invite_a_club_you_are_not_in(client, db, user, people, event):
    public = add_group(db, people["user2"].id)
    assert client.post(url(event), json={"group_ids": [public.id]}).status_code == 403

    private = add_group(db, people["user2"].id, visibility=GroupVisibility.private, name="Hemliga")
    missing = client.post(url(event), json={"group_ids": [9999]})
    hidden = client.post(url(event), json={"group_ids": [private.id]})
    assert missing.status_code == hidden.status_code == 404
    assert missing.json() == hidden.json()
    assert db.query(EventInvitation).count() == 0


# ---------- Vem får hantera inbjudningar ----------


def test_only_the_creator_can_invite_read_and_remove(client, db, user, people):
    # Öppet event, privat event man är inbjuden till och klubbens privata event:
    # i alla tre får bara skaparen bjuda in, läsa listan och ta bort inbjudningar.
    open_event = add_event(db, people["user2"].id, visibility=EventVisibility.open, title="Öppet")
    private_event = add_event(
        db, people["user2"].id, visibility=EventVisibility.invite_only, title="Privat"
    )
    db.add(EventInvitation(event_id=private_event.id, user_id=user.id))
    group = add_group(db, people["user2"].id, visibility=GroupVisibility.private, members=[user.id])
    club_event = add_event(
        db, people["user2"].id, group_id=group.id, visibility=EventVisibility.invite_only, title="Klubb"
    )
    db.commit()
    add_contact(db, user.id, people["user3"].id)

    for event in (open_event, private_event, club_event):
        post = client.post(url(event), json={"usernames": ["user3"]})
        assert post.status_code == 403, event.title
        assert post.json()["detail"] == "Bara den som skapat eventet kan ändra det"
        assert client.get(url(event)).status_code == 403, event.title
        assert client.delete(f"{url(event)}/user3").status_code == 403, event.title
    # Ingen inbjudan skapades, bara min egen till det privata eventet finns kvar.
    assert db.query(EventInvitation).count() == 1


def test_a_hidden_event_looks_like_a_missing_one(client, db, user, people):
    hidden = add_event(db, people["user2"].id, visibility=EventVisibility.invite_only)
    for response in (
        client.get(url(hidden)),
        client.post(url(hidden), json={"usernames": ["user3"]}),
        client.delete(f"{url(hidden)}/user3"),
    ):
        assert response.status_code == 404
        assert response.json()["detail"] == "Eventet finns inte"
    assert client.get("/events/99999/invitations").status_code == 404


# ---------- Lista och ta bort ----------


def test_invitees_are_listed_oldest_first_and_blocked_users_are_hidden(client, db, user, people, event):
    for person in people.values():
        add_contact(db, user.id, person.id)
    client.post(url(event), json={"usernames": ["user3"]})
    client.post(url(event), json={"usernames": ["user2", "user4"]})
    assert usernames(client.get(url(event))) == ["user3", "user2", "user4"]

    # Blockerar man någon efteråt syns personen inte längre i listan.
    contact = db.query(Contact).filter(Contact.addressee_id == people["user2"].id).one()
    contact.status = "BLOCKED"
    db.commit()
    assert usernames(client.get(url(event))) == ["user3", "user4"]


def test_remove_an_invitation(client, db, user, people, event):
    add_contact(db, user.id, people["user2"].id)
    client.post(url(event), json={"usernames": ["user2"]})

    assert client.delete(f"{url(event)}/user2").status_code == 204
    assert client.get(url(event)).json() == []

    login_as(people["user2"])
    assert client.get("/events/").json() == []


def test_remove_invitation_that_does_not_exist(client, db, user, people, event):
    for name in ("user2", "okand"):
        response = client.delete(f"{url(event)}/{name}")
        assert response.status_code == 404
        assert response.json()["detail"] == "Personen är inte inbjuden"
