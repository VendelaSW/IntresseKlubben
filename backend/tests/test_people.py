"""Tester för GET /users/ - lista andra användare, filtrerat på intresse,
kommun, kön och/eller ålder (skrivskyddat, kräver inloggning)."""

from datetime import date

import pytest

from app.crud.profile import calculate_age
from app.models.interest import Interest
from app.models.profile import GenderEnum
from app.models.user import User
from tests.helpers import make_profile


def _create_person(db, username, name, *, municipality_code="1480", interests=None, **profile_fields):
    person = User(username=username, password_hash="unused")
    db.add(person)
    db.commit()
    db.add(make_profile(person.id, name=name, municipality_code=municipality_code, **profile_fields))
    db.commit()
    if interests:
        person.interests = interests
        db.commit()
    return person


def test_lists_other_people_with_a_profile(client, db, user):
    _create_person(db, "bob", "Bob")
    # Ingen profil - ska inte dyka upp i listan.
    db.add(User(username="ingenprofil", password_hash="unused"))
    db.commit()

    response = client.get("/users/")

    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert names == ["Bob"]


def test_excludes_yourself(client, db, user):
    db.add(make_profile(user.id, name="Jag"))
    db.commit()
    _create_person(db, "bob", "Bob")

    names = [p["name"] for p in client.get("/users/").json()]

    assert names == ["Bob"]


def test_filters_by_interest(client, db, user, municipalities):
    climbing = Interest(name="Klättring")
    chess = Interest(name="Schack")
    db.add_all([climbing, chess])
    db.commit()
    _create_person(db, "bob", "Bob", interests=[climbing])
    _create_person(db, "sara", "Sara", interests=[chess])

    names = [p["name"] for p in client.get("/users/", params={"interest_id": climbing.id}).json()]

    assert names == ["Bob"]


def test_filters_by_municipality(client, db, user, municipalities):
    _create_person(db, "bob", "Bob", municipality_code="1480")
    _create_person(db, "sara", "Sara", municipality_code="1481")

    names = [p["name"] for p in client.get("/users/", params={"municipality_code": "1480"}).json()]

    assert names == ["Bob"]


def test_includes_username_and_interests(client, db, user):
    climbing = Interest(name="Klättring")
    db.add(climbing)
    db.commit()
    _create_person(db, "bob", "Bob", interests=[climbing])

    body = client.get("/users/").json()[0]

    assert body["username"] == "bob"
    assert [i["name"] for i in body["interests"]] == ["Klättring"]


def test_interests_are_sorted_by_name(client, db, user):
    # Tillagda i omvänd bokstavsordning, för att inte råka stämma av misstag.
    schack = Interest(name="Schack")
    klattring = Interest(name="Klättring")
    db.add_all([schack, klattring])
    db.commit()
    _create_person(db, "bob", "Bob", interests=[schack, klattring])

    body = client.get("/users/").json()[0]

    assert [i["name"] for i in body["interests"]] == ["Klättring", "Schack"]


def test_private_fields_not_in_response(client, db, user):
    _create_person(db, "bob", "Bob")

    body = client.get("/users/").json()[0]

    assert set(body) == {"username", "name", "age", "municipality_name", "district", "image_url", "interests"}


def test_excludes_dismissed_suggestions(client, db, user):
    _create_person(db, "bob", "Bob")
    client.post("/users/bob/dismiss")

    names = [p["name"] for p in client.get("/users/").json()]

    assert names == []


def test_requires_login(client, db):
    response = client.get("/users/")
    assert response.status_code == 401


# --- Kön ---
# Kön visas aldrig för andra, så filtret får bara ta med dem som själva valt
# att gå att hitta på kön. Annars skulle träffarna avslöja allas kön.


def test_gender_filter_only_finds_people_who_opted_in(client, db, user):
    _create_person(db, "bob", "Bob", gender=GenderEnum.man, gender_searchable=True)
    _create_person(db, "olle", "Olle", gender=GenderEnum.man)  # har inte valt det
    _create_person(db, "sara", "Sara", gender=GenderEnum.kvinna, gender_searchable=True)

    names = [p["name"] for p in client.get("/users/", params={"gender": "man"}).json()]

    assert names == ["Bob"]


def test_without_gender_filter_everyone_is_listed(client, db, user):
    _create_person(db, "bob", "Bob", gender=GenderEnum.man, gender_searchable=True)
    _create_person(db, "olle", "Olle", gender=GenderEnum.man)

    names = [p["name"] for p in client.get("/users/").json()]

    assert names == ["Bob", "Olle"]


def test_gender_filter_rejects_unknown_gender(client, db, user):
    response = client.get("/users/", params={"gender": "robot"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Ogiltigt värde"


# --- Ålder ---


@pytest.fixture
def fixed_today(monkeypatch):
    """Låter testet bestämma vilket datum det är i dag för åldersfiltret."""
    import app.crud.profile as profile_crud

    def set_today(today):
        class FixedDate(date):
            @classmethod
            def today(cls):
                return today

        monkeypatch.setattr(profile_crud, "date", FixedDate)

    return set_today


def test_age_filters_count_birthdays_like_the_shown_age(client, db, user, fixed_today):
    fixed_today(date(2026, 5, 10))
    _create_person(db, "fyllde26", "A", birth_date=date(2000, 5, 10))   # 26 i dag
    _create_person(db, "fyller26", "B", birth_date=date(2000, 5, 11))   # 25
    _create_person(db, "fyllde36", "C", birth_date=date(1990, 5, 10))   # 36
    _create_person(db, "fyller36", "D", birth_date=date(1990, 5, 11))   # 35

    def names(**params):
        return sorted(p["name"] for p in client.get("/users/", params=params).json())

    assert names(min_age=26) == ["A", "C", "D"]
    assert names(max_age=35) == ["A", "B", "D"]
    assert names(min_age=26, max_age=35) == ["A", "D"]


@pytest.mark.parametrize("today", [date(2026, 2, 28), date(2026, 3, 1), date(2028, 2, 29)])
def test_age_filter_matches_calculate_age_around_leap_days(client, db, user, fixed_today, today):
    fixed_today(today)
    birth_dates = [date(2000, 2, 28), date(2000, 2, 29), date(2000, 3, 1), date(2003, 2, 28), date(2003, 3, 1)]
    for i, born in enumerate(birth_dates):
        _create_person(db, f"p{i}", f"P{i}", birth_date=born)

    for age in sorted({calculate_age(born) for born in birth_dates}):
        found = {p["username"] for p in client.get("/users/", params={"min_age": age, "max_age": age}).json()}
        expected = {f"p{i}" for i, born in enumerate(birth_dates) if calculate_age(born) == age}
        assert found == expected, age


def test_min_age_above_max_age_gives_400(client, db, user):
    response = client.get("/users/", params={"min_age": 40, "max_age": 30})

    assert response.status_code == 400
    assert response.json()["detail"] == "Lägsta åldern kan inte vara högre än den högsta."


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"min_age": -1}, "Får inte vara lägre än 0"),
        ({"max_age": 121}, "Får inte vara högre än 120"),
        ({"min_age": "tjugo"}, "Fältet måste vara ett heltal"),
    ],
)
def test_age_filter_rejects_invalid_ages_with_swedish_message(client, db, user, params, message):
    response = client.get("/users/", params=params)

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == message


def test_filters_combine(client, db, user, municipalities, fixed_today):
    fixed_today(date(2026, 5, 10))
    common = {"gender": GenderEnum.kvinna, "gender_searchable": True, "birth_date": date(1996, 1, 1)}
    _create_person(db, "sara", "Sara", **common)
    _create_person(db, "molndal", "Mölndal", **{**common, "municipality_code": "1481"})
    _create_person(db, "aldre", "Äldre", **{**common, "birth_date": date(1960, 1, 1)})
    _create_person(db, "man", "Man", **{**common, "gender": GenderEnum.man})

    params = {"gender": "kvinna", "municipality_code": "1480", "min_age": 25, "max_age": 35}
    names = [p["name"] for p in client.get("/users/", params=params).json()]

    assert names == ["Sara"]
