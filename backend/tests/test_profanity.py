import pytest

from app.core.profanity import BLOCKED_STEMS, censor_text, contains_profanity, validate_clean_text
from app.models.group import Group
from app.models.interest import Interest
from app.models.user import User
from tests.helpers import profile_payload


def _assert_profanity_error(response, field, field_name):
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"] == ["body", field]
    assert error["type"] == "value_error"
    assert error["msg"] == f"Value error, {field_name} innehåller otillåtet språk."


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


@pytest.mark.parametrize(
    "word", [stem + suffix for stem, suffixes in BLOCKED_STEMS.items() for suffix in suffixes]
)
def test_contains_profanity_matches_blocklist_case_insensitively(word):
    assert contains_profanity(f"Hej {word.upper()}!") is True


@pytest.mark.parametrize(
    "text",
    ["", "Morgonlöparna", "Scunthorpe", "nigeriansk fagott", "horisont", "hormon", "FAGOTT", "Vendela_123"],
)
def test_clean_text_passes_validation(text):
    assert contains_profanity(text) is False
    assert validate_clean_text(text) is None
    assert censor_text(text) == text


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_default_validation_error_is_swedish(word):
    with pytest.raises(ValueError) as error:
        validate_clean_text(word)
    assert str(error.value) == "Innehållet innehåller otillåtet språk."


@pytest.mark.parametrize(
    "word",
    ["FITTA", "Svartskalle", "FUCK", "Cunt", "f1ttan", "fuck123", "fuck_you", "fuck.you", "fuck-you", "123fuck",
     "f1ttan123", "123h0r@n"],
)
def test_registration_rejects_profanity_with_swedish_error(client, db, word):
    response = client.post(
        "/users/register",
        json={"username": word, "email": "new@example.com", "password": "hemligt123"},
    )
    _assert_profanity_error(response, "username", "Användarnamnet")
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
    _assert_profanity_error(response, "name", "Namnet")
    assert client.get("/profile/").json()["name"] == "Vendela"


@pytest.mark.parametrize("word", ["FITTA", "Svartskalle", "FUCK", "Cunt"])
def test_profile_creation_rejects_profanity(client, user, profile_creation_payload, word):
    response = client.post("/profile/", json={**profile_creation_payload, "name": word})
    _assert_profanity_error(response, "name", "Namnet")
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
    _assert_profanity_error(response, "name", "Gruppnamnet")
    assert db.query(Group).count() == 0


def test_group_creation_accepts_clean_name(client, db, user, group_payload):
    response = client.post("/groups/", json=group_payload)
    assert response.status_code == 201
    assert response.json()["name"] == "Schackklubben"
    assert db.query(Group).one().name == "Schackklubben"


@pytest.mark.parametrize(
    "word",
    ["fittan", "horan", "svartskallen", "negrerna", "blattarna", "horunge", "fiiiitta",
        "h0ran", "f1ttan", "n3grerna", "bl4ttarna", "h0r@n", "$vartskallen", "fuuuck"],
)
def test_inflections_and_normalization_are_detected_and_censored(word):
    assert contains_profanity(word) is True
    assert censor_text(f"Hej {word}, vi ses!") == f"Hej {'*' * len(word)}, vi ses!"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Hej fuck123!", "Hej ****123!"),
        ("fuck_you", "****_you"),
        ("fuck.you", "****.you"),
        ("fuck-you", "****-you"),
        ("123fuck", "123****"),
        ("f1ttan123", "******123"),
        ("123h0r@n", "123*****"),
        ("h0ran och fiiiitta!", "***** och ********!"),
    ],
)
def test_censorship_preserves_original_delimiters_and_text(text, expected):
    assert contains_profanity(text) is True
    assert censor_text(text) == expected


@pytest.mark.parametrize("word", ["horunge", "f1ttan", "FUCK"])
@pytest.mark.parametrize("field", ["description", "meeting_info"])
def test_group_text_fields_reject_profanity(client, db, user, group_payload, field, word):
    response = client.post("/groups/", json={**group_payload, field: f"Hej {word}!"})
    field_name = "Beskrivningen" if field == "description" else "Mötesinformationen"
    _assert_profanity_error(response, field, field_name)
    assert db.query(Group).count() == 0


@pytest.mark.parametrize("meeting_info", [None, "", "  ", "Lördag kl 14 vid horisonten"])
def test_group_text_fields_accept_clean_and_optional_values(client, user, group_payload, meeting_info):
    response = client.post(
        "/groups/",
        json={**group_payload, "description": "Schack och fagott.", "meeting_info": meeting_info},
    )
    assert response.status_code == 201
    assert response.json()["description"] == "Schack och fagott."
    assert response.json()["meeting_info"] == (meeting_info.strip() or None if meeting_info else None)


@pytest.mark.parametrize("word", ["horunge", "f1ttan", "FUCK"])
def test_profile_bio_creation_rejects_profanity(client, user, profile_creation_payload, word):
    response = client.post(
        "/profile/", json={**profile_creation_payload, "profile_text": f"Hej {word}!"}
    )
    _assert_profanity_error(response, "profile_text", "Om mig-texten")
    assert client.get("/profile/").status_code == 404


@pytest.mark.parametrize("word", ["horunge", "f1ttan", "FUCK"])
def test_profile_bio_update_rejection_preserves_existing_text(client, user, profile_creation_payload, word):
    assert client.post("/profile/", json=profile_creation_payload).status_code == 201
    response = client.patch("/profile/", json={"profile_text": f"Hej {word}!"})
    _assert_profanity_error(response, "profile_text", "Om mig-texten")
    assert client.get("/profile/").json()["profile_text"] == profile_creation_payload["profile_text"]


def test_profile_bio_accepts_clean_text_on_creation_and_update(client, user, profile_creation_payload):
    response = client.post(
        "/profile/", json={**profile_creation_payload, "profile_text": "  Jag spelar fagott.  "}
    )
    assert response.status_code == 201
    assert response.json()["profile_text"] == "Jag spelar fagott."
    response = client.patch("/profile/", json={"profile_text": "  Jag gillar horisonten.  "})
    assert response.status_code == 200
    assert client.get("/profile/").json()["profile_text"] == "Jag gillar horisonten."


def test_sent_message_masks_normalized_profanity(client, db, user):
    db.add(User(id=2, username="friend", password_hash="unused"))
    db.commit()
    response = client.post(
        "/messages", json={"recipient_username": "friend", "text": "Hej h0ran och fiiiitta!"}
    )
    assert response.status_code == 201
    assert response.json()["text"] == "Hej ***** och ********!"
    assert client.get("/messages/friend").json()[0]["text"] == "Hej ***** och ********!"
