import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Contact, GroupMessage, Interest, User


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
def outsider(db):
    other = User(id=2, username="outsider", password_hash="unused")
    db.add(other)
    db.commit()
    return other


def _login_as(other: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: other


def test_member_can_post_clean_message(client, db, user, group):
    response = client.post(f"/groups/{group['id']}/messages", json={"content": "  Hej allihop!  "})
    assert response.status_code == 201
    body = response.json()
    assert body["group_id"] == group["id"]
    assert body["sender_id"] == user.id
    assert body["content"] == "Hej allihop!"
    assert db.get(GroupMessage, body["id"]).content == "Hej allihop!"


def test_slurs_are_masked_before_saving(client, db, user, group):
    response = client.post(f"/groups/{group['id']}/messages", json={"content": "din fitta"})
    assert response.status_code == 201
    assert response.json()["content"] == "din *****"
    assert db.get(GroupMessage, response.json()["id"]).content == "din *****"


def test_history_is_in_chronological_order(client, db, user, outsider, group):
    client.post(f"/groups/{group['id']}/messages", json={"content": "Första"})
    _login_as(outsider)
    assert client.put(f"/groups/{group['id']}/members/me").status_code == 200
    client.post(f"/groups/{group['id']}/messages", json={"content": "Andra"})

    response = client.get(f"/groups/{group['id']}/messages")
    assert response.status_code == 200
    assert [(m["sender_id"], m["content"]) for m in response.json()] == [
        (user.id, "Första"),
        (outsider.id, "Andra"),
    ]


def test_non_member_gets_403(client, db, user, outsider, group):
    client.post(f"/groups/{group['id']}/messages", json={"content": "Hej!"})
    _login_as(outsider)

    response = client.post(f"/groups/{group['id']}/messages", json={"content": "Hej!"})
    assert response.status_code == 403
    assert client.get(f"/groups/{group['id']}/messages").status_code == 403
    assert db.query(GroupMessage).count() == 1


def test_private_group_chat_gives_404_to_non_member(client, user, outsider, group):
    private = client.post("/groups/", json={
        "name": "Hemlig",
        "description": "Bara för inbjudna.",
        "interest_id": group["interest_id"],
        "municipality_code": "1480",
        "visibility": "private",
    }).json()
    _login_as(outsider)

    assert client.get(f"/groups/{private['id']}/messages").status_code == 404
    assert client.post(f"/groups/{private['id']}/messages", json={"content": "Hej"}).status_code == 404


def test_unknown_group_gives_404(client, user):
    assert client.get("/groups/9999/messages").status_code == 404


def test_blank_message_gives_422(client, user, group):
    response = client.post(f"/groups/{group['id']}/messages", json={"content": "   "})
    assert response.status_code == 422
    assert "Meddelandet får inte vara tomt" in str(response.json()["detail"])


def test_messages_from_blocked_users_are_hidden(client, db, user, outsider, group):
    _login_as(outsider)
    client.put(f"/groups/{group['id']}/members/me")
    client.post(f"/groups/{group['id']}/messages", json={"content": "Från outsider"})
    _login_as(user)
    client.post(f"/groups/{group['id']}/messages", json={"content": "Från user"})

    # outsider har blockerat user - ska döljas åt båda hållen.
    db.add(Contact(
        requester_id=outsider.id,
        addressee_id=user.id,
        pair_key=f"{user.id}:{outsider.id}",
        status="BLOCKED",
    ))
    db.commit()

    assert [m["content"] for m in client.get(f"/groups/{group['id']}/messages").json()] == ["Från user"]
    _login_as(outsider)
    assert [m["content"] for m in client.get(f"/groups/{group['id']}/messages").json()] == ["Från outsider"]
