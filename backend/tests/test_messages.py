import pytest

from app.models.contact import Contact
from app.models.message import Message
from app.models.user import User


@pytest.fixture
def friend(db):
    other = User(id=2, username="friend", password_hash="unused")
    db.add(other)
    db.commit()
    return other


def test_send_message_returns_sender_and_recipient(client, user, friend):
    response = client.post("/messages", json={"recipient_username": "friend", "text": "Hej!"})
    assert response.status_code == 201
    body = response.json()
    assert body["sender_id"] == user.id
    assert body["recipient_id"] == friend.id
    assert body["text"] == "Hej!"


def test_conversation_shows_both_directions_in_order(client, db, user, friend):
    client.post("/messages", json={"recipient_username": "friend", "text": "Hej!"})
    # Svaret från "friend" läggs direkt i databasen - att skicka själva
    # POST-anropet testas redan ovan, oavsett vem som är inloggad kör det
    # samma kod.
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Hej tillbaka!"))
    db.commit()

    response = client.get("/messages/friend")
    assert response.status_code == 200
    assert [m["text"] for m in response.json()] == ["Hej!", "Hej tillbaka!"]


def test_blocked_user_cannot_send_or_read_conversation(client, db, user, friend):
    # friend har blockerat user - ska nekas åt båda hållen, oavsett vem
    # som blockerat vem.
    db.add(Contact(
        requester_id=friend.id,
        addressee_id=user.id,
        pair_key=f"{min(user.id, friend.id)}:{max(user.id, friend.id)}",
        status="BLOCKED",
    ))
    db.commit()

    response = client.post("/messages", json={"recipient_username": "friend", "text": "Hej!"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Användaren finns inte"

    assert client.get("/messages/friend").status_code == 404


def test_send_to_unknown_username_gives_404(client, user):
    response = client.post("/messages", json={"recipient_username": "okand", "text": "Hej!"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Användaren finns inte"


def test_send_to_self_gives_400(client, user):
    response = client.post("/messages", json={"recipient_username": user.username, "text": "Hej!"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Du kan inte skicka ett meddelande till dig själv."


def test_blank_message_gives_422(client, user, friend):
    response = client.post("/messages", json={"recipient_username": "friend", "text": "   "})
    assert response.status_code == 422
    assert "Meddelandet får inte vara tomt" in str(response.json()["detail"])


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("post", "/messages", {"json": {"recipient_username": "friend", "text": "Hej!"}}),
        ("get", "/messages/friend", {}),
        ("get", "/messages", {}),
    ],
)
def test_not_logged_in_gives_401(client, friend, method, path, kwargs):
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


@pytest.fixture
def other_friend(db):
    other = User(id=3, username="annan-van", password_hash="unused")
    db.add(other)
    db.commit()
    return other


def test_list_conversations_shows_latest_message_newest_conversation_first(
    client, db, user, friend, other_friend
):
    db.add(Message(sender_id=user.id, recipient_id=friend.id, text="Först till friend"))
    db.commit()
    client.post("/messages", json={"recipient_username": "annan-van", "text": "Sen till annan-van"})

    response = client.get("/messages")
    assert response.status_code == 200
    body = response.json()
    assert [c["username"] for c in body] == ["annan-van", "friend"]
    assert body[0]["last_message"] == "Sen till annan-van"
    assert body[1]["last_message"] == "Först till friend"


def test_list_conversations_shows_only_the_latest_message_per_person(client, db, user, friend):
    db.add(Message(sender_id=user.id, recipient_id=friend.id, text="Första"))
    db.commit()
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Senaste"))
    db.commit()

    response = client.get("/messages")
    body = response.json()
    assert len(body) == 1
    assert body[0]["last_message"] == "Senaste"


def test_list_conversations_hides_blocked_users(client, db, user, friend):
    client.post("/messages", json={"recipient_username": "friend", "text": "Hej!"})
    db.add(Contact(
        requester_id=friend.id,
        addressee_id=user.id,
        pair_key=f"{min(user.id, friend.id)}:{max(user.id, friend.id)}",
        status="BLOCKED",
    ))
    db.commit()

    assert client.get("/messages").json() == []
