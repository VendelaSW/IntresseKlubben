import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import GroupInvitation, GroupMember, Interest, User
from app.models.group import GroupVisibility
from tests.event_helpers import add_contact, add_group


@pytest.fixture(autouse=True)
def interest(db):
    row = Interest(id=1, name="Löpning")
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def people(db, user, municipalities):
    """Användare 2–4. testuser (id 1) är ägaren i de flesta testerna."""
    users = [User(id=i, username=f"user{i}", password_hash="unused") for i in (2, 3, 4)]
    db.add_all(users)
    db.commit()
    return {u.username: u for u in users}


@pytest.fixture
def group(db, user, people):
    return add_group(db, user.id, visibility=GroupVisibility.private)


def login_as(person):
    app.dependency_overrides[get_current_user] = lambda: person


def invite(client, group, *user_ids):
    return client.post(f"/groups/{group.id}/invitations", json={"user_ids": list(user_ids)})


def invitation_count(client):
    response = client.get("/groups/invitations/count")
    assert response.status_code == 200
    return response.json()["count"]


# ---------- Bjuda in ----------


def test_owner_invites_a_contact_who_then_sees_the_invitation(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)

    response = invite(client, group, 2)
    assert response.status_code == 200
    assert [u["username"] for u in response.json()] == ["user2"]

    login_as(people["user2"])
    listed = client.get("/groups/invitations").json()
    assert [g["name"] for g in listed] == ["Löparna"]
    assert listed[0]["is_invited"] is True
    assert listed[0]["is_member"] is False
    assert invitation_count(client) == 1


def test_contacts_expose_the_ids_used_to_invite_and_the_answer_has_them_too(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)

    # Frontend bjuder in med id (aldrig användarnamn), så kontaktlistan måste ha dem.
    contacts = client.get("/contacts/").json()["contacts"]
    assert [c["user"]["id"] for c in contacts] == [people["user2"].id]

    invited = invite(client, group, contacts[0]["user"]["id"]).json()
    assert [u["id"] for u in invited] == [people["user2"].id]


def test_can_invite_to_a_public_club_too(client, db, user, people):
    public = add_group(db, user.id, visibility=GroupVisibility.public)
    add_contact(db, user.id, people["user2"].id)
    assert invite(client, public, 2).status_code == 200

    login_as(people["user2"])
    assert invitation_count(client) == 1


def test_only_contacts_can_be_invited(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    # En okänd användare och en som inte är en kontakt ger samma svar, och ingen blir inbjuden.
    unknown = invite(client, group, 2, 999)
    stranger = invite(client, group, 2, 3)
    assert unknown.status_code == stranger.status_code == 422
    assert unknown.json() == stranger.json()
    assert db.query(GroupInvitation).count() == 0


def test_nobody_selected_is_rejected(client, user, people, group):
    assert invite(client, group).status_code == 422


def test_inviting_twice_or_a_member_does_nothing(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    add_contact(db, user.id, people["user3"].id)
    db.add(GroupMember(group_id=group.id, user_id=people["user3"].id))
    db.commit()

    assert [u["username"] for u in invite(client, group, 2, 3).json()] == ["user2"]
    assert invite(client, group, 2).json() == []
    assert db.query(GroupInvitation).count() == 1


def test_someone_blocked_with_the_owner_is_skipped_silently(client, db, user, people):
    allowed = add_group(db, user.id, visibility=GroupVisibility.private, members_can_invite=True)
    db.add(GroupMember(group_id=allowed.id, user_id=people["user2"].id))
    # user3 är user2:s kontakt, men ägaren har blockerat user3. Ett fel skulle avslöja
    # för user2 att ägaren har en blockering, så user3 hoppas över utan felmeddelande.
    add_contact(db, people["user2"].id, people["user3"].id)
    add_contact(db, user.id, people["user3"].id, status="BLOCKED")
    db.commit()

    login_as(people["user2"])
    response = invite(client, allowed, 3)
    assert response.status_code == 200
    assert response.json() == []
    assert db.query(GroupInvitation).count() == 0


# ---------- Vem får bjuda in ----------


def test_members_cannot_invite_by_default(client, db, user, people, group):
    db.add(GroupMember(group_id=group.id, user_id=people["user2"].id))
    add_contact(db, people["user2"].id, people["user3"].id)
    db.commit()

    login_as(people["user2"])
    assert client.get(f"/groups/{group.id}").json()["can_invite"] is False
    response = invite(client, group, 3)
    assert response.status_code == 403
    assert response.json()["detail"] == "Du kan inte bjuda in till den här klubben"
    assert db.query(GroupInvitation).count() == 0


def test_members_can_invite_when_the_owner_allows_it(client, db, user, people):
    allowed = add_group(db, user.id, visibility=GroupVisibility.private, members_can_invite=True)
    db.add(GroupMember(group_id=allowed.id, user_id=people["user2"].id))
    add_contact(db, people["user2"].id, people["user3"].id)
    db.commit()

    login_as(people["user2"])
    assert client.get(f"/groups/{allowed.id}").json()["can_invite"] is True
    assert [u["username"] for u in invite(client, allowed, 3).json()] == ["user3"]


def test_only_someone_who_is_a_member_can_invite(client, db, user, people, group):
    add_contact(db, people["user2"].id, people["user3"].id)

    login_as(people["user2"])
    # En privat klubb avslöjas inte för den som inte är med.
    assert invite(client, group, 3).status_code == 404
    public = add_group(db, user.id, name="Öppna")
    assert invite(client, public, 3).status_code == 403


def test_owner_sees_can_invite_and_the_setting(client, user, people, group):
    body = client.get(f"/groups/{group.id}").json()
    assert body["can_invite"] is True
    assert body["members_can_invite"] is False


def test_create_group_stores_members_can_invite(client, user, municipalities):
    response = client.post(
        "/groups/",
        json={
            "name": "Nya",
            "description": "Beskrivning",
            "interest_id": 1,
            "municipality_code": "1480",
            "members_can_invite": True,
        },
    )
    assert response.status_code == 201
    assert response.json()["members_can_invite"] is True


# ---------- Den inbjudna ----------


def test_invited_person_can_open_a_private_club_and_join_it(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)

    login_as(people["user2"])
    assert client.get(f"/groups/{group.id}").status_code == 200
    joined = client.put(f"/groups/{group.id}/members/me")
    assert joined.status_code == 200
    assert joined.json()["is_member"] is True
    assert joined.json()["is_invited"] is False
    # Inbjudan har gjort sitt.
    assert db.query(GroupInvitation).count() == 0
    assert invitation_count(client) == 0


def test_blocking_an_invited_person_removes_the_invitation(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)
    assert db.query(GroupInvitation).count() == 1

    # Ägaren blockerar den inbjudna: klubben syns inte längre och går inte att gå med i.
    assert client.post(f"/users/{people['user2'].id}/block").status_code == 200
    assert db.query(GroupInvitation).count() == 0
    login_as(people["user2"])
    assert invitation_count(client) == 0
    assert client.get(f"/groups/{group.id}").status_code == 404
    assert client.put(f"/groups/{group.id}/members/me").status_code == 404


def test_an_invited_person_blocking_the_owner_removes_the_invitation(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)

    login_as(people["user2"])
    assert client.post(f"/users/{user.id}/block").status_code == 200
    assert db.query(GroupInvitation).count() == 0


def test_blocking_someone_leaves_other_invitations_alone(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    add_contact(db, user.id, people["user3"].id)
    invite(client, group, 2, 3)

    assert client.post(f"/users/{people['user2'].id}/block").status_code == 200
    assert [i.user_id for i in db.query(GroupInvitation).all()] == [people["user3"].id]


def test_a_private_club_is_still_hidden_from_everyone_else(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)

    login_as(people["user3"])
    assert client.get(f"/groups/{group.id}").status_code == 404
    assert client.put(f"/groups/{group.id}/members/me").status_code == 404
    assert invitation_count(client) == 0


def test_declining_removes_the_invitation_and_hides_the_club_again(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)

    login_as(people["user2"])
    assert client.delete(f"/groups/{group.id}/invitations/me").status_code == 204
    assert invitation_count(client) == 0
    assert client.get(f"/groups/{group.id}").status_code == 404
    assert db.query(GroupMember).filter(GroupMember.user_id == people["user2"].id).count() == 0


def test_declining_twice_is_fine_for_a_public_club(client, db, user, people):
    public = add_group(db, user.id)
    add_contact(db, user.id, people["user2"].id)
    invite(client, public, 2)

    login_as(people["user2"])
    assert client.delete(f"/groups/{public.id}/invitations/me").status_code == 204
    assert client.delete(f"/groups/{public.id}/invitations/me").status_code == 204


def test_invitations_list_leaves_out_clubs_you_are_already_in(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)
    db.add(GroupMember(group_id=group.id, user_id=people["user2"].id))
    db.commit()

    login_as(people["user2"])
    assert client.get("/groups/invitations").json() == []
    assert invitation_count(client) == 0


def test_deleting_the_club_removes_its_invitations(client, db, user, people, group):
    add_contact(db, user.id, people["user2"].id)
    invite(client, group, 2)
    assert client.delete(f"/groups/{group.id}").status_code == 204
    assert db.query(GroupInvitation).count() == 0
