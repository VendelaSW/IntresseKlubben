"""Tester för intressen på profilen som egna rader (UserInterest): ett intresse per person, om personen själv
håller på med det eller bara är intresserad (activity, SCRUM-271), och egna ord."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Interest, UserInterest
from app.models.user_interest import PRACTISES, practice_from
from tests.helpers import profile_payload


@pytest.fixture
def interests(db):
    items = [Interest(name="Pokémon TCG", activities=["spela", "samla"]), Interest(name="Yoga")]
    db.add_all(items)
    db.commit()
    return {i.name: i.id for i in items}


def _names(response):
    return [i["name"] for i in response.json()]


def _practices(response):
    return {i["name"]: i["practices"] for i in response.json()}


def _save(db, user, interest_id, activity):
    db.add(UserInterest(user_id=user.id, interest_id=interest_id, activity=activity))
    db.commit()


def test_an_interest_added_on_the_profile_is_just_interested(client, db, user, interests):
    response = client.put(f"/profile/interests/{interests['Yoga']}")

    link = db.query(UserInterest).one()
    assert (link.activity, link.label, link.source) == ("", None, "picker")
    assert _practices(response) == {"Yoga": False}


@pytest.mark.parametrize("first, second", [("", PRACTISES), (PRACTISES, PRACTISES), ("", "")])
def test_an_interest_is_only_saved_once_per_person(db, user, interests, first, second):
    _save(db, user, interests["Yoga"], first)

    db.add(UserInterest(user_id=user.id, interest_id=interests["Yoga"], activity=second))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.query(UserInterest).count() == 1


def test_the_profile_says_which_interests_the_person_practises(client, db, user, interests):
    _save(db, user, interests["Pokémon TCG"], PRACTISES)
    _save(db, user, interests["Yoga"], "")

    assert _practices(client.get("/profile/interests")) == {"Pokémon TCG": True, "Yoga": False}


# --- Utövar eller intresserad (växeln på profilen) -------------------------------------


def test_practices_can_be_switched_on_and_off(client, db, user, interests):
    _save(db, user, interests["Yoga"], "")

    response = client.put(f"/profile/interests/{interests['Yoga']}/practices", json={"practices": True})
    assert response.status_code == 200
    assert _practices(response) == {"Yoga": True}
    assert db.query(UserInterest).one().activity == PRACTISES

    response = client.put(f"/profile/interests/{interests['Yoga']}/practices", json={"practices": False})
    assert _practices(response) == {"Yoga": False}
    db.expire_all()
    assert db.query(UserInterest).one().activity == ""


def test_practices_on_an_interest_you_do_not_have_gives_404(client, user, interests):
    response = client.put(f"/profile/interests/{interests['Yoga']}/practices", json={"practices": True})
    assert response.status_code == 404


def test_practices_must_be_true_or_false(client, db, user, interests):
    _save(db, user, interests["Yoga"], "")
    response = client.put(f"/profile/interests/{interests['Yoga']}/practices", json={"practices": "kanske"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "activities, expected",
    [(["spela"], PRACTISES), (["samla", "titta"], PRACTISES), (["titta", "lyssna"], ""), ([], ""), ([""], "")],
)
def test_the_old_activities_become_practises_or_interested(activities, expected):
    # Samma uppdelning som migrationen e8c4a1f7b305 gjorde av de sparade raderna.
    assert practice_from(activities) == expected


# --- Ta bort --------------------------------------------------------------------------


def test_removing_an_interest_removes_its_row(client, db, user, interests):
    _save(db, user, interests["Pokémon TCG"], PRACTISES)
    _save(db, user, interests["Yoga"], "")

    response = client.delete(f"/profile/interests/{interests['Pokémon TCG']}")

    assert response.status_code == 200
    assert _names(response) == ["Yoga"]
    assert [link.interest_id for link in db.query(UserInterest).all()] == [interests["Yoga"]]


def test_the_only_interest_cannot_be_removed(client, db, user, interests):
    _save(db, user, interests["Pokémon TCG"], PRACTISES)

    response = client.delete(f"/profile/interests/{interests['Pokémon TCG']}")

    assert response.status_code == 409
    assert db.query(UserInterest).count() == 1


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


def test_creating_a_profile_keeps_whether_you_practise_an_interest_you_already_have(
    client, db, user, interests, municipalities
):
    _save(db, user, interests["Pokémon TCG"], PRACTISES)

    response = client.post("/profile/", json=profile_payload([interests["Pokémon TCG"]]))

    assert response.status_code == 201
    assert [link.activity for link in db.query(UserInterest).all()] == [PRACTISES]


def test_creating_a_profile_drops_interests_that_are_not_in_the_list(client, db, user, interests, municipalities):
    _save(db, user, interests["Yoga"], "")
    _save(db, user, interests["Pokémon TCG"], PRACTISES)

    response = client.post("/profile/", json=profile_payload([interests["Pokémon TCG"]]))

    assert response.status_code == 201
    assert _names(client.get("/profile/interests")) == ["Pokémon TCG"]
    assert [link.activity for link in db.query(UserInterest).all()] == [PRACTISES]
