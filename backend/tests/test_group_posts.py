"""Tester för inlägg i klubbar: POST/GET /groups/{id}/posts, DELETE /groups/{id}/posts/{post_id} och
PUT/DELETE /groups/{id}/posts/{post_id}/pin."""

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Contact, GroupPost, Interest, User


@pytest.fixture
def group(client, db, user, municipalities):
    """En öppen klubb som `user` äger (och därmed är med i)."""
    interest = Interest(name="Löpning")
    db.add(interest)
    db.commit()
    response = client.post("/groups/", json={
        "name": "Morgonlöparna",
        "description": "Lugna rundor före jobbet.",
        "interest_id": interest.id,
        "municipality_code": "1480",
    })
    assert response.status_code == 201, response.json()
    return response.json()


@pytest.fixture
def member(client, db, group):
    """En vanlig medlem (inte ägare) i klubben."""
    other = User(id=2, username="medlem", password_hash="unused")
    db.add(other)
    db.commit()
    _login_as(other)
    assert client.put(f"/groups/{group['id']}/members/me").status_code == 200
    return other


@pytest.fixture
def outsider(db):
    other = User(id=3, username="outsider", password_hash="unused")
    db.add(other)
    db.commit()
    return other


def _login_as(other: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: other


def _post(client, group, content):
    return client.post(f"/groups/{group['id']}/posts", json={"content": content})


def test_member_can_post(client, db, user, group):
    response = _post(client, group, "  Ny regel: vi springer i alla väder.  ")
    assert response.status_code == 201
    body = response.json()
    assert body["group_id"] == group["id"]
    assert body["author_id"] == user.id
    assert body["content"] == "Ny regel: vi springer i alla väder."
    assert db.get(GroupPost, body["id"]).content == body["content"]


def test_slurs_are_masked_before_saving(client, user, group):
    assert _post(client, group, "din fitta").json()["content"] == "din *****"


def test_posts_are_newest_first(client, user, member, group):
    _login_as(user)
    _post(client, group, "Första")
    _login_as(member)
    _post(client, group, "Andra")

    response = client.get(f"/groups/{group['id']}/posts")
    assert response.status_code == 200
    assert [(p["author_id"], p["content"]) for p in response.json()] == [(member.id, "Andra"), (user.id, "Första")]


def test_non_member_cannot_post_or_read(client, db, user, outsider, group):
    _post(client, group, "Hej!")
    _login_as(outsider)

    assert _post(client, group, "Hej!").status_code == 403
    assert client.get(f"/groups/{group['id']}/posts").status_code == 403
    assert db.query(GroupPost).count() == 1


def test_private_group_posts_give_404_to_non_member(client, user, outsider, group):
    private = client.post("/groups/", json={
        "name": "Hemlig",
        "description": "Bara för inbjudna.",
        "interest_id": group["interest_id"],
        "municipality_code": "1480",
        "visibility": "private",
    }).json()
    _login_as(outsider)

    assert client.get(f"/groups/{private['id']}/posts").status_code == 404
    assert client.post(f"/groups/{private['id']}/posts", json={"content": "Hej"}).status_code == 404


@pytest.mark.parametrize("content, message", [("   ", "Inlägget får inte vara tomt"), ("x" * 2001, "max vara 2000")])
def test_empty_or_too_long_post_gives_422(client, user, group, content, message):
    response = _post(client, group, content)
    assert response.status_code == 422
    assert message in str(response.json()["detail"])


def test_author_can_delete_own_post(client, db, user, member, group):
    post_id = _post(client, group, "Mitt inlägg").json()["id"]  # member är inloggad
    assert client.delete(f"/groups/{group['id']}/posts/{post_id}").status_code == 204
    assert db.get(GroupPost, post_id) is None


def test_owner_can_delete_any_post(client, db, user, member, group):
    post_id = _post(client, group, "Från medlemmen").json()["id"]
    _login_as(user)
    assert client.delete(f"/groups/{group['id']}/posts/{post_id}").status_code == 204
    assert db.get(GroupPost, post_id) is None


def test_other_member_cannot_delete(client, db, user, member, group):
    _login_as(user)
    post_id = _post(client, group, "Från ägaren").json()["id"]
    _login_as(member)

    response = client.delete(f"/groups/{group['id']}/posts/{post_id}")
    assert response.status_code == 403
    assert "Bara den som skrev inlägget" in response.json()["detail"]
    assert db.get(GroupPost, post_id) is not None


def test_non_member_cannot_delete(client, db, user, outsider, group):
    post_id = _post(client, group, "Från ägaren").json()["id"]
    _login_as(outsider)
    assert client.delete(f"/groups/{group['id']}/posts/{post_id}").status_code == 403
    assert db.get(GroupPost, post_id) is not None


def test_unknown_post_or_post_in_other_group_gives_404(client, user, group):
    other_group = client.post("/groups/", json={
        "name": "Kvällslöparna",
        "description": "Rundor efter jobbet.",
        "interest_id": group["interest_id"],
        "municipality_code": "1480",
    }).json()
    post_id = _post(client, group, "Hej").json()["id"]

    assert client.delete(f"/groups/{group['id']}/posts/9999").status_code == 404
    assert client.delete(f"/groups/{other_group['id']}/posts/{post_id}").status_code == 404


def test_posts_from_blocked_users_are_hidden(client, db, user, member, group):
    _post(client, group, "Från medlemmen")
    _login_as(user)
    _post(client, group, "Från ägaren")

    # Medlemmen har blockerat ägaren: döljs åt båda hållen.
    db.add(Contact(
        requester_id=member.id,
        addressee_id=user.id,
        pair_key=f"{user.id}:{member.id}",
        status="BLOCKED",
    ))
    db.commit()

    assert [p["content"] for p in client.get(f"/groups/{group['id']}/posts").json()] == ["Från ägaren"]
    _login_as(member)
    assert [p["content"] for p in client.get(f"/groups/{group['id']}/posts").json()] == ["Från medlemmen"]



def _pin(client, group, post_id):
    return client.put(f"/groups/{group['id']}/posts/{post_id}/pin")


def test_owner_can_pin_and_pinned_post_is_first(client, user, member, group):
    _login_as(user)
    first = _post(client, group, "Regler").json()["id"]
    _post(client, group, "Nyare")

    response = _pin(client, group, first)
    assert response.status_code == 200
    assert response.json()["pinned_at"] is not None
    assert [p["content"] for p in client.get(f"/groups/{group['id']}/posts").json()] == ["Regler", "Nyare"]


def test_only_one_pinned_post_at_a_time(client, db, user, group):
    first = _post(client, group, "Första").json()["id"]
    second = _post(client, group, "Andra").json()["id"]
    _pin(client, group, first)
    _pin(client, group, second)

    assert db.get(GroupPost, first).pinned_at is None
    assert db.get(GroupPost, second).pinned_at is not None


def test_owner_can_unpin(client, db, user, group):
    post_id = _post(client, group, "Regler").json()["id"]
    _pin(client, group, post_id)

    response = client.delete(f"/groups/{group['id']}/posts/{post_id}/pin")
    assert response.status_code == 200
    assert response.json()["pinned_at"] is None
    assert db.get(GroupPost, post_id).pinned_at is None


def test_member_cannot_pin_or_unpin(client, db, user, member, group):
    post_id = _post(client, group, "Mitt inlägg").json()["id"]  # member är inloggad

    response = _pin(client, group, post_id)
    assert response.status_code == 403
    assert "Bara klubbens ägare" in response.json()["detail"]
    assert client.delete(f"/groups/{group['id']}/posts/{post_id}/pin").status_code == 403
    assert db.get(GroupPost, post_id).pinned_at is None


def test_non_member_cannot_pin(client, user, outsider, group):
    post_id = _post(client, group, "Regler").json()["id"]
    _login_as(outsider)
    assert _pin(client, group, post_id).status_code == 403


def test_pin_unknown_post_gives_404(client, user, group):
    assert _pin(client, group, 9999).status_code == 404


def test_author_cannot_delete_own_pinned_post(client, db, user, member, group):
    post_id = _post(client, group, "Från medlemmen").json()["id"]
    _login_as(user)
    _pin(client, group, post_id)
    _login_as(member)

    response = client.delete(f"/groups/{group['id']}/posts/{post_id}")
    assert response.status_code == 403
    assert "fastnålat" in response.json()["detail"]
    assert db.get(GroupPost, post_id) is not None


def test_owner_can_delete_pinned_post(client, db, user, group):
    post_id = _post(client, group, "Regler").json()["id"]
    _pin(client, group, post_id)
    assert client.delete(f"/groups/{group['id']}/posts/{post_id}").status_code == 204
    assert db.get(GroupPost, post_id) is None
