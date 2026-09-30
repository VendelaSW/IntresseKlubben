"""Tester för GET /users/{username}/profile - att se en annan
användares profil (skrivskyddat)."""

from app.models.profile import Profile
from app.models.user import User


def _create_user_with_profile(db, username, name="Bob"):
    other_user = User(username=username, password_hash="unused")
    db.add(other_user)
    db.commit()
    db.add(Profile(user_id=other_user.id, name=name))
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
