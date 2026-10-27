"""Roller i klubbar (SCRUM-160): ägaren gör medlemmar till administratörer, som svarar på ansökningar, tar
bort medlemmar och modererar klubbchatten."""

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Group, GroupMember, GroupMessage, Interest, Notification, User
from app.models.group import GroupRole, GroupVisibility
from tests.helpers import make_profile

OWNER, ADMIN, MEMBER, OTHER = 2, 3, 4, 5


@pytest.fixture
def people(db, user, municipalities):
    """Olle äger klubben, Ada är administratör, Mia medlem och Sven står utanför."""
    found = {}
    for user_id, name in [(OWNER, "Olle"), (ADMIN, "Ada"), (MEMBER, "Mia"), (OTHER, "Sven")]:
        person = User(id=user_id, username=name.lower(), password_hash="x")
        db.add(person)
        db.flush()
        db.add(make_profile(user_id, name=name))
        found[user_id] = person
    db.commit()
    return found


@pytest.fixture
def club(db, people):
    interest = Interest(name="Schack")
    db.add(interest)
    db.flush()
    group = Group(
        name="Schackklubben", description="d", interest_id=interest.id, municipality_code="1480",
        visibility=GroupVisibility.application,
        members=[
            GroupMember(user_id=OWNER, role=GroupRole.owner),
            GroupMember(user_id=ADMIN, role=GroupRole.admin),
            GroupMember(user_id=MEMBER, role=GroupRole.member),
        ],
    )
    db.add(group)
    db.commit()
    return group


def login(people, user_id):
    app.dependency_overrides[get_current_user] = lambda: people[user_id]


def _role(db, club, user_id):
    db.expire_all()
    membership = db.query(GroupMember).filter_by(group_id=club.id, user_id=user_id).one_or_none()
    return membership.role if membership else None


def _set_role(client, club, user_id, role):
    return client.put(f"/groups/{club.id}/members/{user_id}/role", json={"role": role})


# --- Ägaren sätter roller -----------------------------------------------------


def test_the_owner_can_make_a_member_admin_and_take_it_back(client, db, club, people):
    login(people, OWNER)
    assert _set_role(client, club, MEMBER, "admin").status_code == 204
    assert _role(db, club, MEMBER) == GroupRole.admin
    assert _set_role(client, club, MEMBER, "member").status_code == 204
    assert _role(db, club, MEMBER) == GroupRole.member
    titles = [n.title for n in db.query(Notification).filter_by(user_id=MEMBER).order_by(Notification.id)]
    assert titles == ["Du är administratör i Schackklubben", "Du är inte längre administratör i Schackklubben"]


def test_only_the_owner_sets_roles(client, db, club, people):
    login(people, ADMIN)
    response = _set_role(client, club, MEMBER, "admin")
    assert response.status_code == 403
    assert response.json()["detail"] == "Bara klubbens ägare kan ändra roller"


@pytest.mark.parametrize("role", ["owner", "boss"])
def test_only_admin_and_member_can_be_given(client, club, people, role):
    login(people, OWNER)
    assert _set_role(client, club, MEMBER, role).status_code == 422


def test_the_owners_role_cannot_change_and_outsiders_have_none(client, club, people):
    login(people, OWNER)
    assert _set_role(client, club, OWNER, "member").json()["detail"] == "Ägarens roll går inte att ändra"
    assert _set_role(client, club, OTHER, "admin").json()["detail"] == "Personen är inte med i klubben"


def test_the_response_and_member_list_show_the_role(client, club, people):
    login(people, ADMIN)
    body = client.get(f"/groups/{club.id}").json()
    assert (body["is_admin"], body["is_owner"]) == (True, False)
    roles = {m["id"]: m["role"] for m in client.get(f"/groups/{club.id}/members").json()}
    assert roles == {OWNER: "owner", ADMIN: "admin", MEMBER: "member"}


# --- Ansökningar --------------------------------------------------------------


def test_an_admin_sees_and_answers_applications(client, db, club, people):
    login(people, OTHER)
    client.put(f"/groups/{club.id}/requests/me", json={"message": "Hej"})
    login(people, ADMIN)
    assert client.get(f"/groups/{club.id}").json()["request_count"] == 1
    assert [r["user"]["id"] for r in client.get(f"/groups/{club.id}/requests").json()] == [OTHER]
    assert client.put(f"/groups/{club.id}/requests/{OTHER}").status_code == 204
    assert _role(db, club, OTHER) == GroupRole.member


def test_a_plain_member_cannot_answer_applications(client, club, people):
    login(people, MEMBER)
    assert client.get(f"/groups/{club.id}/requests").status_code == 403


# --- Ta bort medlemmar --------------------------------------------------------


def test_an_admin_can_remove_a_member_who_is_told(client, db, club, people):
    login(people, ADMIN)
    assert client.delete(f"/groups/{club.id}/members/{MEMBER}").status_code == 204
    assert _role(db, club, MEMBER) is None
    (note,) = db.query(Notification).filter_by(user_id=MEMBER).all()
    assert note.title == "Du har tagits bort ur Schackklubben"


def test_only_the_owner_can_remove_an_admin(client, db, club, people):
    db.add(GroupMember(group_id=club.id, user_id=OTHER, role=GroupRole.admin))
    db.commit()
    login(people, ADMIN)
    response = client.delete(f"/groups/{club.id}/members/{OTHER}")
    assert response.status_code == 409
    assert response.json()["detail"] == "Bara ägaren kan ta bort en administratör"
    login(people, OWNER)
    assert client.delete(f"/groups/{club.id}/members/{OTHER}").status_code == 204


def test_the_owner_cannot_be_removed(client, club, people):
    login(people, ADMIN)
    response = client.delete(f"/groups/{club.id}/members/{OWNER}")
    assert response.status_code == 409
    assert response.json()["detail"] == "Ägaren kan inte tas bort ur klubben"


def test_a_plain_member_cannot_remove_anyone(client, club, people):
    login(people, MEMBER)
    assert client.delete(f"/groups/{club.id}/members/{ADMIN}").status_code == 403


def test_leaving_yourself_still_works(client, db, club, people):
    login(people, MEMBER)
    assert client.delete(f"/groups/{club.id}/members/me").status_code == 204
    assert _role(db, club, MEMBER) is None


def test_when_the_owner_leaves_an_admin_takes_over(client, db, club, people):
    login(people, OWNER)
    client.delete(f"/groups/{club.id}/members/me")
    assert _role(db, club, ADMIN) == GroupRole.owner
    assert _role(db, club, MEMBER) == GroupRole.member


# --- Moderera chatten ---------------------------------------------------------


def _message(db, club, sender_id, text="hej"):
    message = GroupMessage(group_id=club.id, sender_id=sender_id, content=text)
    db.add(message)
    db.commit()
    return message


@pytest.mark.parametrize("by", [ADMIN, OWNER, MEMBER])
def test_admins_owner_and_the_author_can_delete_a_message(client, db, club, people, by):
    message = _message(db, club, MEMBER)
    login(people, by)
    assert client.delete(f"/groups/{club.id}/messages/{message.id}").status_code == 204
    assert db.query(GroupMessage).count() == 0


def test_another_member_cannot_delete_a_message(client, db, club, people):
    db.add(GroupMember(group_id=club.id, user_id=OTHER, role=GroupRole.member))
    db.commit()
    message = _message(db, club, MEMBER)
    login(people, OTHER)
    response = client.delete(f"/groups/{club.id}/messages/{message.id}")
    assert response.status_code == 403
    assert db.query(GroupMessage).count() == 1


def test_deleting_a_missing_message_is_404(client, club, people):
    login(people, ADMIN)
    assert client.delete(f"/groups/{club.id}/messages/999").status_code == 404


def test_an_admin_can_delete_posts_but_not_a_pinned_one(client, db, club, people):
    login(people, MEMBER)
    post = client.post(f"/groups/{club.id}/posts", json={"content": "Hej allihop"}).json()
    pinned = client.post(f"/groups/{club.id}/posts", json={"content": "Regler"}).json()
    login(people, OWNER)
    client.put(f"/groups/{club.id}/posts/{pinned['id']}/pin")
    login(people, ADMIN)
    assert client.delete(f"/groups/{club.id}/posts/{post['id']}").status_code == 204
    assert client.delete(f"/groups/{club.id}/posts/{pinned['id']}").status_code == 403
