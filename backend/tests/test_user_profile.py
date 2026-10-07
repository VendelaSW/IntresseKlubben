"""Tester för GET /users/{username}/profile - att se en annan
användares profil (skrivskyddat)."""

from app.models.interest import Interest
from app.models.profile import Profile
from app.models.user import User
from tests.helpers import make_profile


def _create_user_with_profile(db, username, name="Bob"):
    other_user = User(username=username, password_hash="unused")
    db.add(other_user)
    db.commit()
    db.add(make_profile(other_user.id, name=name))
    db.commit()
    return other_user


def test_view_another_users_profile(client, db, user):
    _create_user_with_profile(db, "bob")

    response = client.get("/users/bob/profile")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Bob"


def test_view_profile_requires_login(client, db):
    _create_user_with_profile(db, "bob")

    response = client.get("/users/bob/profile")

    assert response.status_code == 401
    assert response.json()["detail"] == "Du är inte inloggad."


def test_unknown_username_gives_404(client, user):
    response = client.get("/users/finnsinte/profile")
    assert response.status_code == 404


def test_user_without_profile_gives_404(client, db, user):
    User_ = User(username="bob", password_hash="unused")
    db.add(User_)
    db.commit()

    response = client.get("/users/bob/profile")

    assert response.status_code == 404


def test_other_users_private_fields_not_in_response(client, db, user):
    _create_user_with_profile(db, "bob")

    response = client.get("/users/bob/profile")

    body = response.json()
    assert set(body) == {
        "name", "age", "municipality_name", "district", "image_url", "profile_text", "interests"
    }


def test_other_users_profile_text_is_visible(client, db, user):
    other = _create_user_with_profile(db, "bob")
    profile = db.query(Profile).filter(Profile.user_id == other.id).one()
    profile.profile_text = "Jag gillar brädspel."
    db.commit()

    body = client.get("/users/bob/profile").json()

    assert body["profile_text"] == "Jag gillar brädspel."


def test_other_users_interests_are_visible_sorted_by_name(client, db, user):
    other = _create_user_with_profile(db, "bob")
    chess = Interest(name="Schack")
    board_games = Interest(name="Brädspel")
    other.interests = [chess, board_games]
    db.commit()

    body = client.get("/users/bob/profile").json()

    # Bara id och namn, samma som på personkorten, sorterade på namn.
    assert body["interests"] == [
        {"id": board_games.id, "name": "Brädspel"},
        {"id": chess.id, "name": "Schack"},
    ]


def test_other_user_without_interests_gives_empty_list(client, db, user):
    _create_user_with_profile(db, "bob")

    assert client.get("/users/bob/profile").json()["interests"] == []
