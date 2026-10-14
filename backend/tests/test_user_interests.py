"""Tester för intressen på profilen som egna rader (UserInterest): aktivitet,
styrka och egna ord.

API:t tar inte emot aktivitet än, så rader med aktivitet läggs in direkt i
databasen. Testerna visar att det som redan finns (lägga till, lista, ta bort)
klarar att samma intresse är sparat flera gånger."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Interest, UserInterest
from tests.helpers import profile_payload


@pytest.fixture
def interests(db):
    items = [Interest(name="Pokémon TCG", activities=["spela", "samla"]), Interest(name="Yoga")]
    db.add_all(items)
    db.commit()
    return {i.name: i.id for i in items}


def _names(response):
    return [i["name"] for i in response.json()]


def _save(db, user, interest_id, activity):
    db.add(UserInterest(user_id=user.id, interest_id=interest_id, activity=activity))
    db.commit()


def test_an_interest_added_on_the_profile_has_no_activity_yet(client, db, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")

    link = db.query(UserInterest).one()
    assert (link.activity, link.strength, link.label, link.source) == ("", 2, None, "picker")


def test_same_interest_can_be_saved_with_different_activities(db, user, interests):
    _save(db, user, interests["Pokémon TCG"], "spela")
    _save(db, user, interests["Pokémon TCG"], "samla")

    assert sorted(link.activity for link in db.query(UserInterest).all()) == ["samla", "spela"]


# "" är "ingen aktivitet angiven" och räknas som en aktivitet bland andra, så
# ett intresse utan aktivitet kan inte heller sparas två gånger.
@pytest.mark.parametrize("activity", ["spela", ""])
def test_same_interest_and_activity_cannot_be_saved_twice(db, user, interests, activity):
    _save(db, user, interests["Pokémon TCG"], activity)

    db.add(UserInterest(user_id=user.id, interest_id=interests["Pokémon TCG"], activity=activity))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.query(UserInterest).count() == 1


def test_an_interest_with_two_activities_is_listed_once(client, db, user, interests):
    _save(db, user, interests["Pokémon TCG"], "spela")
    _save(db, user, interests["Pokémon TCG"], "samla")
    _save(db, user, interests["Yoga"], "")

    assert _names(client.get("/profile/interests")) == ["Pokémon TCG", "Yoga"]


def test_removing_an_interest_removes_all_its_activities(client, db, user, interests):
    _save(db, user, interests["Pokémon TCG"], "spela")
    _save(db, user, interests["Pokémon TCG"], "samla")
    _save(db, user, interests["Yoga"], "")

    response = client.delete(f"/profile/interests/{interests['Pokémon TCG']}")

    assert response.status_code == 200
    assert _names(response) == ["Yoga"]
    assert [link.interest_id for link in db.query(UserInterest).all()] == [interests["Yoga"]]


def test_the_only_interest_cannot_be_removed_even_with_two_activities(client, db, user, interests):
    _save(db, user, interests["Pokémon TCG"], "spela")
    _save(db, user, interests["Pokémon TCG"], "samla")

    response = client.delete(f"/profile/interests/{interests['Pokémon TCG']}")

    assert response.status_code == 409
    assert db.query(UserInterest).count() == 2


def test_an_interest_keeps_its_list_of_activities(db, interests):
    db.expire_all()
    assert db.get(Interest, interests["Pokémon TCG"]).activities == ["spela", "samla"]
    assert db.get(Interest, interests["Yoga"]).activities is None


# --- Skapa profil när man redan har intressen -------------------------------------


def test_creating_a_profile_with_an_interest_you_already_have(client, db, user, interests, municipalities):
    # Intresset läggs till före profilen. Förut blev det ett serverfel, eftersom
    # hela listan byttes ut och intresset då sparades en gång till.
    client.put(f"/profile/interests/{interests['Yoga']}")

    response = client.post("/profile/", json=profile_payload([interests["Yoga"]]))

    assert response.status_code == 201
    assert [link.interest_id for link in db.query(UserInterest).all()] == [interests["Yoga"]]


def test_creating_a_profile_keeps_the_activity_of_an_interest_you_already_have(
    client, db, user, interests, municipalities
):
    _save(db, user, interests["Pokémon TCG"], "spela")
    _save(db, user, interests["Pokémon TCG"], "samla")

    response = client.post("/profile/", json=profile_payload([interests["Pokémon TCG"]]))

    assert response.status_code == 201
    assert sorted(link.activity for link in db.query(UserInterest).all()) == ["samla", "spela"]


def test_creating_a_profile_drops_interests_that_are_not_in_the_list(client, db, user, interests, municipalities):
    _save(db, user, interests["Yoga"], "")
    _save(db, user, interests["Pokémon TCG"], "spela")

    response = client.post("/profile/", json=profile_payload([interests["Pokémon TCG"]]))

    assert response.status_code == 201
    assert _names(client.get("/profile/interests")) == ["Pokémon TCG"]
    assert [link.activity for link in db.query(UserInterest).all()] == ["spela"]


# --- Styrka ----------------------------------------------------------------------


@pytest.mark.parametrize("strength", [0, 4, 99])
def test_strength_outside_one_to_three_is_refused(user, interests, strength):
    with pytest.raises(ValueError, match="1, 2 eller 3"):
        UserInterest(user_id=user.id, interest_id=interests["Yoga"], strength=strength)


def test_strength_one_to_three_is_saved(db, user, interests):
    db.add(UserInterest(user_id=user.id, interest_id=interests["Yoga"], strength=3))
    db.commit()
    assert db.query(UserInterest).one().strength == 3
