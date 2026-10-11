"""Valideringsfel ska komma på svenska, med samma form som förut
(`detail` är en lista där varje post har `loc` och `msg`)."""

from tests.helpers import profile_payload


def _errors(response):
    return {tuple(e["loc"])[-1]: e["msg"] for e in response.json()["detail"]}


def test_missing_field_says_the_field_is_required(client, user):
    payload = profile_payload([1])
    del payload["birth_date"]

    response = client.post("/profile/", json=payload)

    assert response.status_code == 422
    assert _errors(response)["birth_date"] == "Fältet är obligatoriskt"


def test_every_missing_field_is_reported_in_swedish(client, user):
    response = client.post("/profile/", json={})

    assert response.status_code == 422
    errors = _errors(response)
    assert set(errors) == {"name", "birth_date", "gender", "municipality_code", "profile_text", "interest_ids"}
    assert set(errors.values()) == {"Fältet är obligatoriskt"}


def test_invalid_enum_value_is_reported_in_swedish(client, user):
    response = client.post("/profile/", json=profile_payload([1], gender="robot"))

    assert _errors(response)["gender"] == "Ogiltigt värde"


def test_invalid_date_is_reported_in_swedish(client, user):
    response = client.post("/profile/", json=profile_payload([1], birth_date="inte-ett-datum"))

    assert _errors(response)["birth_date"] == "Ogiltigt datum"


def test_length_limits_are_reported_in_swedish_with_the_limit(client):
    response = client.post("/users/register", json={"username": "ab", "email": "a@b.se", "password": "kort"})

    errors = _errors(response)
    assert errors["username"] == "Måste vara minst 3 tecken"
    assert errors["password"] == "Måste vara minst 8 tecken"


def test_our_own_swedish_messages_are_left_untouched(client, user):
    response = client.post("/profile/", json=profile_payload([1], name="   "))

    assert "Namn får inte vara tomt" in _errors(response)["name"]
