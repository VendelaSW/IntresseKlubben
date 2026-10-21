import pytest

from app.models.contact import Contact
from app.models.conversation_read import ConversationRead
from app.models.message import Message
from app.models.user import User


@pytest.fixture
def friend(db):
    other = User(id=2, username="friend", password_hash="unused")
    db.add(other)
    db.commit()
    return other


def test_send_message_returns_sender_and_recipient(client, user, friend):
    response = client.post("/messages", json={"recipient_id": 2, "text": "Hej!"})
    assert response.status_code == 201
    body = response.json()
    assert body["sender_id"] == user.id
    assert body["recipient_id"] == friend.id
    assert body["text"] == "Hej!"


def test_conversation_shows_both_directions_in_order(client, db, user, friend):
    client.post("/messages", json={"recipient_id": 2, "text": "Hej!"})
    # Svaret från "friend" läggs direkt i databasen - att skicka själva
    # POST-anropet testas redan ovan, oavsett vem som är inloggad kör det
    # samma kod.
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Hej tillbaka!"))
    db.commit()

    response = client.get("/messages/2")
    assert response.status_code == 200
    assert [m["text"] for m in response.json()["messages"]] == ["Hej!", "Hej tillbaka!"]
    # Vem konversationen är med följer med, bara publika uppgifter.
    assert response.json()["user"] == {"id": 2, "username": "friend", "name": None, "image_url": None}


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

    response = client.post("/messages", json={"recipient_id": 2, "text": "Hej!"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Användaren finns inte"

    assert client.get("/messages/2").status_code == 404


def test_send_to_unknown_user_gives_404(client, user):
    response = client.post("/messages", json={"recipient_id": 9999, "text": "Hej!"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Användaren finns inte"


def test_send_to_self_gives_400(client, user):
    response = client.post("/messages", json={"recipient_id": user.id, "text": "Hej!"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Du kan inte skicka ett meddelande till dig själv."


def test_blank_message_gives_422(client, user, friend):
    response = client.post("/messages", json={"recipient_id": 2, "text": "   "})
    assert response.status_code == 422
    assert "Meddelandet får inte vara tomt" in str(response.json()["detail"])


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("post", "/messages", {"json": {"recipient_id": 2, "text": "Hej!"}}),
        ("get", "/messages/2", {}),
        ("get", "/messages", {}),
        ("put", "/messages/2/read", {}),
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
    client.post("/messages", json={"recipient_id": 3, "text": "Sen till annan-van"})

    response = client.get("/messages")
    assert response.status_code == 200
    body = response.json()
    assert [(c["id"], c["username"]) for c in body] == [(3, "annan-van"), (2, "friend")]
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
    client.post("/messages", json={"recipient_id": 2, "text": "Hej!"})
    db.add(Contact(
        requester_id=friend.id,
        addressee_id=user.id,
        pair_key=f"{min(user.id, friend.id)}:{max(user.id, friend.id)}",
        status="BLOCKED",
    ))
    db.commit()

    assert client.get("/messages").json() == []


def test_list_conversations_says_who_wrote_the_latest_message(client, db, user, friend, other_friend):
    # Senaste i konversationen med friend är från friend, med annan-van från en själv.
    db.add(Message(sender_id=user.id, recipient_id=friend.id, text="Hej friend"))
    db.commit()
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Hej tillbaka"))
    db.commit()
    client.post("/messages", json={"recipient_id": 3, "text": "Hej annan-van"})

    from_me = {c["username"]: c["last_message_from_me"] for c in client.get("/messages").json()}
    assert from_me == {"friend": False, "annan-van": True}


# ---------- Lästa brev (PUT /messages/{user_id}/read) ----------


def _unread(client):
    return {c["username"]: c["unread"] for c in client.get("/messages").json()}


def test_a_letter_from_someone_else_is_unread_until_the_conversation_is_read(client, db, user, friend):
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Hej!"))
    db.commit()
    assert _unread(client) == {"friend": True}

    assert client.put("/messages/2/read").status_code == 204
    assert _unread(client) == {"friend": False}
    # Det står i databasen, inte i webbläsaren: en annan enhet ser samma sak.
    read = db.get(ConversationRead, (user.id, friend.id))
    assert read.last_read_message_id == db.query(Message).one().id
    assert read.read_at is not None


def test_a_new_letter_after_reading_is_unread_again(client, db, user, friend):
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Första"))
    db.commit()
    client.put("/messages/2/read")
    db.add(Message(sender_id=friend.id, recipient_id=user.id, text="Andra"))
    db.commit()
    assert _unread(client) == {"friend": True}


def test_own_letters_are_never_unread(client, user, friend):
    client.post("/messages", json={"recipient_id": 2, "text": "Hej!"})
    assert _unread(client) == {"friend": False}


def test_reading_is_per_person(client, db, user, friend):
    """Att jag har läst gör inte breven lästa för den andra."""
    client.post("/messages", json={"recipient_id": 2, "text": "Hej!"})
    client.put("/messages/2/read")
    assert db.get(ConversationRead, (friend.id, user.id)) is None


def test_reading_twice_or_an_older_state_does_not_move_back(client, db, user, friend):
    first = Message(sender_id=friend.id, recipient_id=user.id, text="Första")
    db.add(first)
    db.commit()
    client.put("/messages/2/read")
    second = Message(sender_id=friend.id, recipient_id=user.id, text="Andra")
    db.add(second)
    db.commit()
    client.put("/messages/2/read")
    assert client.put("/messages/2/read").status_code == 204
    assert db.get(ConversationRead, (user.id, friend.id)).last_read_message_id == second.id


def test_reading_an_empty_conversation_saves_nothing(client, db, user, friend):
    assert client.put("/messages/2/read").status_code == 204
    assert db.query(ConversationRead).count() == 0


def test_reading_a_blocked_or_unknown_user_gives_404(client, db, user, friend):
    assert client.put("/messages/9999/read").status_code == 404
    db.add(Contact(
        requester_id=friend.id,
        addressee_id=user.id,
        pair_key=f"{min(user.id, friend.id)}:{max(user.id, friend.id)}",
        status="BLOCKED",
    ))
    db.commit()
    assert client.put("/messages/2/read").status_code == 404
