from datetime import date, timedelta

import pytest

from app.crud.profile import calculate_age


def _years_ago(years: int) -> date:
    today = date.today()
    # Dag 28 som tak så att 29 februari aldrig ger ett ogiltigt datum.
    return date(today.year - years, today.month, min(today.day, 28))


def test_no_profile_gives_404(client, user):
    response = client.get("/profile/")
    assert response.status_code == 404
    assert response.json()["detail"] == "Ingen profil hittad"


def test_patch_creates_profile_and_get_returns_it(client, user, municipalities):
    response = client.patch("/profile/", json={
        "name": "  Vendela  ",
        "birth_date": _years_ago(20).isoformat(),
        "gender": "ickebinär",
        "municipality_code": "1480",
        "district": " Majorna ",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Vendela"
    assert body["age"] == 20
    assert body["gender"] == "ickebinär"
    assert body["municipality_code"] == "1480"
    assert body["municipality_name"] == "Göteborg"
    assert body["district"] == "Majorna"

    assert client.get("/profile/").json() == body


def test_patch_only_changes_fields_that_are_sent(client, user, municipalities):
    client.patch("/profile/", json={"name": "Vendela", "municipality_code": "1480"})
    body = client.patch("/profile/", json={"district": "Majorna"}).json()
    assert body["name"] == "Vendela"
    assert body["municipality_name"] == "Göteborg"
    assert body["district"] == "Majorna"


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"name": "   "}, "Namn får inte vara tomt"),
        ({"name": "x" * 51}, "Namn får max vara 50 tecken"),
        ({"birth_date": (date.today() + timedelta(days=1)).isoformat()}, "Födelsedatum kan inte vara i framtiden"),
        ({"district": "   "}, "Stadsdel får inte vara tom"),
        ({"district": "x" * 101}, "Stadsdel får max vara 100 tecken"),
    ],
)
def test_invalid_input_is_rejected_with_swedish_message(client, user, payload, message):
    response = client.patch("/profile/", json=payload)
    assert response.status_code == 422
    assert message in str(response.json()["detail"])


def test_invalid_gender_is_rejected(client, user):
    assert client.patch("/profile/", json={"gender": "robot"}).status_code == 422


def test_unknown_municipality_is_rejected(client, user, municipalities):
    response = client.patch("/profile/", json={"municipality_code": "9999"})
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänd kommun"


def test_birth_date_today_is_allowed(client, user):
    response = client.patch("/profile/", json={"name": "Bebis", "birth_date": date.today().isoformat()})
    assert response.status_code == 200
    assert response.json()["age"] == 0


@pytest.mark.parametrize(
    ("birth_date", "today", "expected"),
    [
        (date(2000, 5, 10), date(2026, 5, 9), 25),   # dagen före födelsedagen
        (date(2000, 5, 10), date(2026, 5, 10), 26),  # på födelsedagen
        (date(2000, 2, 29), date(2026, 2, 28), 25),  # skottdagsbarn, icke-skottår
        (date(2000, 2, 29), date(2026, 3, 1), 26),
    ],
)
def test_calculate_age_around_birthdays(monkeypatch, birth_date, today, expected):
    import app.crud.profile as profile_crud

    class FixedDate(date):
        @classmethod
        def today(cls):
            return today

    monkeypatch.setattr(profile_crud, "date", FixedDate)
    assert calculate_age(birth_date) == expected
