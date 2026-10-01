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
    ],
)
def test_not_logged_in_gives_401(client, friend, method, path, kwargs):
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."
