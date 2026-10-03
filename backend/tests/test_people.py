"""Tester för GET /users/ - lista andra användare, filtrerat på intresse
och/eller kommun (skrivskyddat, kräver inloggning)."""

from app.models.interest import Interest
from app.models.profile import Profile
from app.models.user import User


def _create_person(db, username, name, *, municipality_code=None, interests=None):
    person = User(username=username, password_hash="unused")
    db.add(person)
    db.commit()
    db.add(Profile(user_id=person.id, name=name, municipality_code=municipality_code))
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
    db.add(Profile(user_id=user.id, name="Jag"))
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
