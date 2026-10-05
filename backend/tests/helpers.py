"""Gemensamma hjälpfunktioner för testerna."""

from datetime import date

from app.models.profile import GenderEnum, Profile


def make_profile(user_id, **overrides):
    """Ett Profile-objekt med alla obligatoriska fält ifyllda. Skicka med
    egna värden för det testet bryr sig om, t.ex. make_profile(1, name="Bob")."""
    fields = {
        "name": "Test",
        "birth_date": date(1990, 1, 1),
        "gender": GenderEnum.annat,
        "municipality_code": "1480",
        "profile_text": "Hej!",
    }
    fields.update(overrides)
    return Profile(user_id=user_id, **fields)


def profile_payload(interest_ids, **overrides):
    """En giltig kropp till POST /profile/. Skicka med egna värden för det
    testet bryr sig om, t.ex. profile_payload([1], name="Bob")."""
    payload = {
        "name": "Test",
        "birth_date": "1990-01-01",
        "gender": "annat",
        "municipality_code": "1480",
        "profile_text": "Hej!",
        "interest_ids": interest_ids,
    }
    payload.update(overrides)
    return payload
