import pytest

from app.models import Interest
from tests.helpers import profile_payload


@pytest.fixture
def interests(db):
    # Läggs in i en annan ordning än bokstavsordning, så att sorteringen testas.
    items = [Interest(name="Yoga"), Interest(name="Brädspel"), Interest(name="Klättring")]
    db.add_all(items)
    db.commit()
    return {i.name: i.id for i in items}


def _names(response):
    return [i["name"] for i in response.json()]


def test_list_interests_is_sorted_by_name(client, interests):
    response = client.get("/interests/")
    assert response.status_code == 200
    assert _names(response) == ["Brädspel", "Klättring", "Yoga"]


def test_new_user_has_no_interests(client, user, interests):
    response = client.get("/profile/interests")
    assert response.status_code == 200
    assert response.json() == []


def test_add_interests_and_get_them_back(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    response = client.put(f"/profile/interests/{interests['Brädspel']}")
    assert response.status_code == 200
    assert _names(response) == ["Brädspel", "Yoga"]

    assert _names(client.get("/profile/interests")) == ["Brädspel", "Yoga"]


def test_adding_same_interest_twice_gives_no_duplicate(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    response = client.put(f"/profile/interests/{interests['Yoga']}")
    assert response.status_code == 200
    assert _names(response) == ["Yoga"]


def test_remove_interest(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    client.put(f"/profile/interests/{interests['Brädspel']}")

    response = client.delete(f"/profile/interests/{interests['Yoga']}")
    assert response.status_code == 200
    assert _names(response) == ["Brädspel"]
    assert _names(client.get("/profile/interests")) == ["Brädspel"]


def test_cannot_remove_the_last_interest(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")

    response = client.delete(f"/profile/interests/{interests['Yoga']}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Minst ett intresse krävs"
    assert _names(client.get("/profile/interests")) == ["Yoga"]


def test_interest_can_be_swapped_by_adding_the_new_one_first(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")
    client.put(f"/profile/interests/{interests['Brädspel']}")

    response = client.delete(f"/profile/interests/{interests['Yoga']}")

    assert response.status_code == 200
    assert _names(response) == ["Brädspel"]


def test_removing_interest_user_does_not_have_changes_nothing(client, user, interests):
    client.put(f"/profile/interests/{interests['Yoga']}")

    response = client.delete(f"/profile/interests/{interests['Klättring']}")
    assert response.status_code == 200
    assert _names(response) == ["Yoga"]


@pytest.mark.parametrize("method", ["put", "delete"])
def test_unknown_interest_gives_404(client, user, interests, method):
    response = getattr(client, method)("/profile/interests/9999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Intresset finns inte"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/profile/interests"),
        ("put", "/profile/interests/1"),
        ("delete", "/profile/interests/1"),
    ],
)
def test_not_logged_in_gives_401(client, interests, method, path):
    # Med riktig inloggning stoppas anropet redan av get_current_user, så
    # "användaren finns inte" (tidigare 404) kan inte längre inträffa.
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


# --- Intressebiblioteket: utforska och söka -----------------------------------


@pytest.fixture
def library(db):
    """Ett litet träd: Sport och träning › Löpning › Traillöpning, plus Musik
    och ett inaktivt intresse som inte ska synas."""
    sport = Interest(name="Sport och träning", slug="sport-och-traning")
    music = Interest(name="Musik", slug="musik")
    db.add_all([sport, music])
    db.flush()
    running = Interest(name="Löpning", slug="lopning", parent_id=sport.id, aliases="springa\njogga")
    db.add(running)
    db.flush()
    trail = Interest(name="Traillöpning", slug="traillopning", parent_id=running.id, aliases="springa i skogen")
    gym = Interest(name="Gym", slug="gym", parent_id=sport.id)
    old = Interest(name="Gaming", slug="gaming", status="inactive")
    db.add_all([trail, gym, old])
    db.commit()
    return {i.name: i for i in [sport, music, running, trail, gym, old]}


def _browse(response):
    return [(i["name"], i["path"], i["has_children"]) for i in response.json()]


def test_top_lists_the_main_areas(client, user, library):
    response = client.get("/interests/top")
    assert response.status_code == 200
    assert _browse(response) == [("Musik", [], False), ("Sport och träning", [], True)]


def test_children_lists_one_level_down(client, user, library):
    response = client.get(f"/interests/{library['Sport och träning'].id}/children")
    assert response.status_code == 200
    assert _browse(response) == [
        ("Gym", ["Sport och träning"], False),
        ("Löpning", ["Sport och träning"], True),
    ]


def test_children_of_unknown_or_inactive_interest_gives_404(client, user, library):
    assert client.get("/interests/9999/children").status_code == 404
    assert client.get(f"/interests/{library['Gaming'].id}/children").status_code == 404


def test_search_finds_name_and_alias_with_where_it_belongs(client, user, library):
    response = client.get("/interests/search", params={"q": "springa"})
    assert response.status_code == 200
    # Båda via alias; sorterade på namn inom samma nivå.
    assert _browse(response) == [
        ("Löpning", ["Sport och träning"], True),
        ("Traillöpning", ["Sport och träning", "Löpning"], False),
    ]


def test_search_puts_names_starting_with_the_text_first(client, user, library):
    names = [i["name"] for i in client.get("/interests/search", params={"q": "löpning"}).json()]
    assert names == ["Löpning", "Traillöpning"]


def test_search_ignores_case_and_extra_spaces(client, user, library):
    names = [i["name"] for i in client.get("/interests/search", params={"q": "  GYM "}).json()]
    assert names == ["Gym"]


def test_search_treats_percent_and_underscore_as_text(client, user, library):
    assert client.get("/interests/search", params={"q": "%"}).json() == []
    assert client.get("/interests/search", params={"q": "_"}).json() == []


def test_search_needs_text(client, user, library):
    assert client.get("/interests/search", params={"q": ""}).status_code == 422


def test_inactive_interests_are_hidden_everywhere(client, user, library):
    assert "Gaming" not in _names(client.get("/interests/"))
    assert client.get("/interests/search", params={"q": "gaming"}).json() == []


def test_inactive_interest_cannot_be_added_but_can_be_removed(client, db, user, library):
    response = client.put(f"/profile/interests/{library['Gaming'].id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Intresset finns inte"

    # Någon som redan hade det innan det blev inaktivt kan ta bort det.
    user.interests = [library["Gaming"], library["Gym"]]
    db.commit()
    response = client.delete(f"/profile/interests/{library['Gaming'].id}")
    assert response.status_code == 200
    assert _names(response) == ["Gym"]


def test_profile_cannot_be_created_with_inactive_interest(client, user, municipalities, library):
    response = client.post("/profile/", json=profile_payload([library["Gaming"].id]))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"
