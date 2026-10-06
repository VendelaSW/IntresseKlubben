from datetime import date, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.crud.profile import calculate_age
from app.models.interest import Interest
from app.models.profile import Profile
from tests.helpers import profile_payload


def _years_ago(years: int) -> date:
    today = date.today()
    # Dag 28 som tak så att 29 februari aldrig ger ett ogiltigt datum.
    return date(today.year - years, today.month, min(today.day, 28))


@pytest.fixture
def yoga(db):
    interest = Interest(name="Yoga")
    db.add(interest)
    db.commit()
    return interest


def _create_profile(client, yoga, **overrides):
    response = client.post("/profile/", json=profile_payload([yoga.id], **overrides))
    assert response.status_code == 201, response.text
    return response.json()


def test_no_profile_gives_404(client, user):
    response = client.get("/profile/")
    assert response.status_code == 404
    assert response.json()["detail"] == "Ingen profil hittad"


def test_database_rejects_a_profile_without_the_mandatory_fields(db, user):
    # Skyddsnätet under API:et: även en direktskrivning utan alla obligatoriska
    # fält ska nekas av databasen.
    db.add(Profile(user_id=user.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# ---------- POST /profile/ (skapa) ----------


def test_post_creates_profile_and_get_returns_it(client, user, municipalities, yoga):
    response = client.post("/profile/", json=profile_payload(
        [yoga.id],
        name="  Vendela  ",
        birth_date=_years_ago(20).isoformat(),
        gender="ickebinär",
        municipality_code="1480",
        district=" Majorna ",
        profile_text="  Jag gillar yoga.  ",
    ))
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Vendela"
    assert body["age"] == 20
    assert body["gender"] == "ickebinär"
    assert body["municipality_code"] == "1480"
    assert body["municipality_name"] == "Göteborg"
    assert body["district"] == "Majorna"
    assert body["profile_text"] == "Jag gillar yoga."

    assert client.get("/profile/").json() == body


def test_post_sets_the_chosen_interests_and_replaces_earlier_ones(client, db, user, municipalities, yoga):
    chess = Interest(name="Schack")
    db.add(chess)
    db.commit()
    client.put(f"/profile/interests/{chess.id}")

    _create_profile(client, yoga)

    names = [i["name"] for i in client.get("/profile/interests").json()]
    assert names == ["Yoga"]


def test_post_without_district_is_fine(client, user, municipalities, yoga):
    assert _create_profile(client, yoga)["district"] is None


def test_prefer_not_to_say_is_a_valid_gender(client, user, municipalities, yoga):
    assert _create_profile(client, yoga, gender="vill inte uppge")["gender"] == "vill inte uppge"


def test_birth_date_today_is_allowed(client, user, municipalities, yoga):
    body = _create_profile(client, yoga, birth_date=date.today().isoformat())
    assert body["age"] == 0


@pytest.mark.parametrize(
    "field", ["name", "birth_date", "gender", "municipality_code", "profile_text", "interest_ids"]
)
def test_post_requires_every_mandatory_field(client, user, municipalities, yoga, field):
    payload = profile_payload([yoga.id])
    del payload[field]

    assert client.post("/profile/", json=payload).status_code == 422
    assert client.get("/profile/").status_code == 404


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"name": "   "}, "Namn får inte vara tomt"),
        ({"name": "x" * 51}, "Namn får max vara 50 tecken"),
        ({"birth_date": (date.today() + timedelta(days=1)).isoformat()}, "Födelsedatum kan inte vara i framtiden"),
        ({"municipality_code": "  "}, "Välj en kommun"),
        ({"profile_text": "   "}, "Om mig-texten får inte vara tom"),
        ({"profile_text": "x" * 801}, "Om mig-texten får max vara 800 tecken"),
        ({"district": "   "}, "Stadsdel får inte vara tom"),
        ({"district": "x" * 101}, "Stadsdel får max vara 100 tecken"),
        ({"interest_ids": []}, "Välj minst ett intresse"),
    ],
)
def test_post_rejects_invalid_input_with_swedish_message(client, user, municipalities, yoga, overrides, message):
    payload = profile_payload([yoga.id])
    payload.update(overrides)
    response = client.post("/profile/", json=payload)
    assert response.status_code == 422
    assert message in str(response.json()["detail"])


def test_post_rejects_invalid_gender(client, user, municipalities, yoga):
    response = client.post("/profile/", json=profile_payload([yoga.id], gender="robot"))
    assert response.status_code == 422


def test_post_rejects_unknown_municipality_and_saves_nothing(client, user, municipalities, yoga):
    response = client.post("/profile/", json=profile_payload([yoga.id], municipality_code="9999"))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänd kommun"
    assert client.get("/profile/").status_code == 404


def test_post_rejects_unknown_interest_and_saves_nothing(client, user, municipalities, yoga):
    response = client.post("/profile/", json=profile_payload([yoga.id, 9999]))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"
    assert client.get("/profile/").status_code == 404
    assert client.get("/profile/interests").json() == []


def test_post_twice_gives_409(client, user, municipalities, yoga):
    _create_profile(client, yoga)
    response = client.post("/profile/", json=profile_payload([yoga.id], name="Annan"))
    assert response.status_code == 409
    assert response.json()["detail"] == "Du har redan en profil"
    assert client.get("/profile/").json()["name"] == "Test"


def test_post_requires_login(client, municipalities, yoga):
    response = client.post("/profile/", json=profile_payload([yoga.id]))
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


# ---------- PATCH /profile/ (ändra) ----------


def test_patch_without_a_profile_gives_404(client, user):
    response = client.patch("/profile/", json={"district": "Majorna"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Ingen profil hittad"


def test_patch_only_changes_fields_that_are_sent(client, user, municipalities, yoga):
    _create_profile(client, yoga, name="Vendela", municipality_code="1480")
    body = client.patch("/profile/", json={"district": "Majorna"}).json()
    assert body["name"] == "Vendela"
    assert body["municipality_name"] == "Göteborg"
    assert body["district"] == "Majorna"


def test_patch_can_change_the_mandatory_fields(client, user, municipalities, yoga):
    _create_profile(client, yoga)
    body = client.patch("/profile/", json={
        "name": "Ny",
        "gender": "vill inte uppge",
        "municipality_code": "1481",
        "profile_text": "Ny text",
    }).json()
    assert body["name"] == "Ny"
    assert body["gender"] == "vill inte uppge"
    assert body["municipality_name"] == "Mölndal"
    assert body["profile_text"] == "Ny text"


def test_profile_text_is_saved_trimmed_and_returned(client, user, municipalities, yoga):
    _create_profile(client, yoga)
    body = client.patch("/profile/", json={"profile_text": "  Jag gillar brädspel.  "}).json()
    assert body["profile_text"] == "Jag gillar brädspel."
    assert client.get("/profile/").json()["profile_text"] == "Jag gillar brädspel."


def test_profile_text_of_exactly_800_characters_is_accepted(client, user, municipalities, yoga):
    _create_profile(client, yoga)
    response = client.patch("/profile/", json={"profile_text": "x" * 800})
    assert response.status_code == 200
    assert len(response.json()["profile_text"]) == 800


def test_profile_text_is_untouched_when_not_sent(client, user, municipalities, yoga):
    _create_profile(client, yoga, profile_text="Hej")
    body = client.patch("/profile/", json={"name": "Vendela"}).json()
    assert body["profile_text"] == "Hej"


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"name": "   "}, "Namn får inte vara tomt"),
        ({"name": "x" * 51}, "Namn får max vara 50 tecken"),
        ({"birth_date": (date.today() + timedelta(days=1)).isoformat()}, "Födelsedatum kan inte vara i framtiden"),
        ({"municipality_code": "  "}, "Välj en kommun"),
        ({"profile_text": "   "}, "Om mig-texten får inte vara tom"),
        ({"profile_text": "x" * 801}, "Om mig-texten får max vara 800 tecken"),
        ({"district": "   "}, "Stadsdel får inte vara tom"),
        ({"district": "x" * 101}, "Stadsdel får max vara 100 tecken"),
    ],
)
def test_patch_rejects_invalid_input_with_swedish_message(client, user, municipalities, yoga, payload, message):
    _create_profile(client, yoga)
    response = client.patch("/profile/", json=payload)
    assert response.status_code == 422
    assert message in str(response.json()["detail"])


def test_a_mandatory_field_cannot_be_emptied_and_keeps_its_value(client, user, municipalities, yoga):
    _create_profile(client, yoga, profile_text="Behåll mig")
    assert client.patch("/profile/", json={"profile_text": "  "}).status_code == 422
    assert client.get("/profile/").json()["profile_text"] == "Behåll mig"


def test_patch_rejects_invalid_gender(client, user, municipalities, yoga):
    _create_profile(client, yoga)
    assert client.patch("/profile/", json={"gender": "robot"}).status_code == 422


def test_patch_rejects_unknown_municipality(client, user, municipalities, yoga):
    _create_profile(client, yoga)
    response = client.patch("/profile/", json={"municipality_code": "9999"})
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänd kommun"


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
