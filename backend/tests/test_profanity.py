import pytest

from fastapi import HTTPException

from app.core.profanity import BLOCKED_WORDS, censor_text, contains_profanity, validate_clean_text
from app.models.group import Group
from app.models.interest import Interest
from app.models.user import User
from tests.helpers import profile_payload


def test_clean_text_is_unchanged():
    text = "Hej! Ska vi spela padel i Scunthorpe på lördag?"
    assert censor_text(text) == text


@pytest.mark.parametrize("word", ["fuck", "FUCK", "Fuck", "fUcK"])
def test_blocked_word_is_masked_regardless_of_case(word):
    assert censor_text(word) == "*" * len(word)


def test_surrounding_text_is_preserved():
    assert censor_text("Vilken jävla Fitta, eller hur?") == "Vilken jävla *****, eller hur?"


def test_words_containing_blocked_word_are_not_masked():
    assert censor_text("Han är nigeriansk och gillar fagott.") == "Han är nigeriansk och gillar fagott."


def test_sent_message_is_censored(client, db, user):
    db.add(User(id=2, username="friend", password_hash="unused"))
    db.commit()

    response = client.post("/messages", json={"recipient_username": "friend", "text": "Din CUNT!"})
    assert response.status_code == 201
    assert response.json()["text"] == "Din ****!"

    assert client.get("/messages/friend").json()[0]["text"] == "Din ****!"


@pytest.mark.parametrize("word", BLOCKED_WORDS)
def test_contains_profanity_matches_blocklist_case_insensitively(word):
    assert contains_profanity(f"Hej {word.upper()}!") is True


@pytest.mark.parametrize("text", ["", "Morgonlöparna", "Scunthorpe", "nigeriansk fagott"])
def test_clean_text_passes_validation(text):
    assert contains_profanity(text) is False
    assert validate_clean_text(text) is None


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_default_validation_error_is_swedish(word):
    with pytest.raises(HTTPException) as error:
        validate_clean_text(word)
    assert error.value.status_code == 400
    assert error.value.detail == "Innehållet innehåller otillåtet språk."


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_registration_rejects_profanity_with_swedish_error(client, db, word):
    response = client.post(
        "/users/register",
        json={"username": word, "email": "new@example.com", "password": "hemligt123"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Användarnamnet innehåller otillåtet språk."
    assert db.query(User).count() == 0


def test_registration_accepts_clean_username(client, db):
    response = client.post(
        "/users/register",
        json={"username": "Vendela", "email": "new@example.com", "password": "hemligt123"},
    )
    assert response.status_code == 201
    assert response.json()["username"] == "Vendela"
    assert db.query(User).one().username == "Vendela"


@pytest.fixture
def profile_creation_payload(db, municipalities):
    interest = Interest(name="Yoga")
    db.add(interest)
    db.commit()
    return profile_payload([interest.id], name="Vendela")


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_profile_name_rejection_preserves_existing_name(client, user, profile_creation_payload, word):
    assert client.post("/profile/", json=profile_creation_payload).status_code == 201

    response = client.patch("/profile/", json={"name": f"Hej {word}"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Namnet innehåller otillåtet språk."
    assert client.get("/profile/").json()["name"] == "Vendela"


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_profile_creation_rejects_profanity(client, user, profile_creation_payload, word):
    response = client.post("/profile/", json={**profile_creation_payload, "name": word})
    assert response.status_code == 400
    assert response.json()["detail"] == "Namnet innehåller otillåtet språk."
    assert client.get("/profile/").status_code == 404


def test_profile_accepts_clean_name(client, user, profile_creation_payload):
    response = client.post("/profile/", json={**profile_creation_payload, "name": "  Vendela  "})
    assert response.status_code == 201
    assert response.json()["name"] == "Vendela"
    assert client.get("/profile/").json()["name"] == "Vendela"

    response = client.patch("/profile/", json={"name": "  Anna  "})
    assert response.status_code == 200
    assert response.json()["name"] == "Anna"
    assert client.get("/profile/").json()["name"] == "Anna"


@pytest.fixture
def group_payload(db, municipalities):
    interest = Interest(name="Schack")
    db.add(interest)
    db.commit()
    return {
        "name": "Schackklubben",
        "description": "Schack på lördagar.",
        "interest_id": interest.id,
        "municipality_code": "1480",
    }


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_group_creation_rejects_profanity_with_swedish_error(client, db, user, group_payload, word):
    response = client.post("/groups/", json={**group_payload, "name": f"{word} klubb"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Gruppnamnet innehåller otillåtet språk."
    assert db.query(Group).count() == 0


def test_group_creation_accepts_clean_name(client, db, user, group_payload):
    response = client.post("/groups/", json=group_payload)
    assert response.status_code == 201
    assert response.json()["name"] == "Schackklubben"
    assert db.query(Group).one().name == "Schackklubben"
