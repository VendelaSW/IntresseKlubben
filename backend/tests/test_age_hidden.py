"""Dölj åldern för andra (SCRUM-134): man ser den själv och moderatorerna ser den, men inte andra, och den som
har dolt sin ålder kommer inte med när man filtrerar på ålder."""

from datetime import date

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import Profile, User
from tests.helpers import make_profile

OTHER, MODERATOR = 2, 3


@pytest.fixture
def people(db, user, municipalities):
    db.add(make_profile(user.id, name="Jag"))
    other = User(id=OTHER, username="greta", password_hash="x")
    moderator = User(id=MODERATOR, username="moa", password_hash="x", is_moderator=True)
    db.add_all([other, moderator])
    db.flush()
    db.add(make_profile(OTHER, name="Greta", birth_date=date(1990, 1, 1), age_hidden=True))
    db.add(make_profile(MODERATOR, name="Moa"))
    db.commit()
    return {"me": user, OTHER: other, MODERATOR: moderator}


def login(person):
    app.dependency_overrides[get_current_user] = lambda: person


def greta_card(client):
    return next(p for p in client.get("/users/").json() if p["id"] == OTHER)


def test_others_do_not_see_a_hidden_age(client, people):
    login(people["me"])
    assert greta_card(client)["age"] is None
    body = client.get(f"/users/{OTHER}/profile").json()
    assert body["age"] is None and body["age_hidden"] is False


def test_moderators_see_a_hidden_age_and_that_it_is_hidden(client, people):
    login(people[MODERATOR])
    card = greta_card(client)
    assert card["age"] is not None and card["age_hidden"] is True
    body = client.get(f"/users/{OTHER}/profile").json()
    assert body["age"] is not None and body["age_hidden"] is True


def test_you_see_your_own_age_and_can_hide_and_show_it(client, people):
    login(people["me"])
    assert client.get("/profile/").json()["age_hidden"] is False
    body = client.patch("/profile/", json={"age_hidden": True}).json()
    assert body["age_hidden"] is True and body["age"] is not None
    assert client.patch("/profile/", json={"age_hidden": False}).json()["age_hidden"] is False


def test_a_hidden_age_is_left_out_of_age_filters_but_not_other_lists(client, db, people):
    login(people["me"])
    ids = lambda q: {p["id"] for p in client.get(f"/users/{q}").json()}  # noqa: E731
    assert OTHER in ids("")
    assert OTHER not in ids("?min_age=18")
    assert OTHER not in ids("?max_age=99")
    db.query(Profile).filter_by(user_id=OTHER).update({"age_hidden": False})
    db.commit()
    assert OTHER in ids("?min_age=18&max_age=99")
