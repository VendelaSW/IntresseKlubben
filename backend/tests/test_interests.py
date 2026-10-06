import pytest

from app.models import Interest


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
