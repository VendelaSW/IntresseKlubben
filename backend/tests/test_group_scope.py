"""Klubbarnas räckvidd (SCRUM-282) och nivå och max antal medlemmar (SCRUM-216)."""

import pytest

from app.models import Group, GroupMember, Interest, Municipality, User
from app.models.group import GroupRole

# Göteborg (1480): Västra Götalands län (14), Västergötland (7), Götaland. Umeå (2480): Västerbottens län (24),
# Västerbotten (23), Norrland. Se data/regions.json.


@pytest.fixture
def interest(db):
    running = Interest(name="Löpning")
    db.add(running)
    db.commit()
    return running


@pytest.fixture
def umea(db, municipalities):
    db.add(Municipality(code="2480", name="Umeå"))
    db.commit()


def _payload(interest, **changes) -> dict:
    return {"name": "Morgonlöparna", "description": "Lugna rundor.", "interest_id": interest.id, **changes}


def _create(client, interest, **changes):
    return client.post("/groups/", json=_payload(interest, **changes))


# --- Skapa -------------------------------------------------------------------


def test_a_club_created_with_only_a_kommun_works_as_before(client, user, interest, municipalities):
    body = _create(client, interest, municipality_code="1480").json()
    assert (body["scope"], body["scope_code"], body["scope_name"]) == ("kommun", "1480", "Göteborg")
    assert (body["municipality_code"], body["municipality_name"]) == ("1480", "Göteborg")


@pytest.mark.parametrize(
    "scope, code, name",
    [
        ("country", None, "Hela Sverige"),
        ("landsdel", "norrland", "Norrland"),
        ("landskap", "7", "Västergötland"),
        ("lan", "14", "Västra Götalands län"),
    ],
)
def test_a_club_can_cover_a_larger_area_without_a_kommun(client, user, interest, scope, code, name):
    response = _create(client, interest, scope=scope, scope_code=code)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert (body["scope"], body["scope_name"]) == (scope, name)
    assert body["municipality_code"] is None and body["municipality_name"] is None
    assert body["scope_code"] == (code or "SE")


def test_a_kommun_sent_with_a_larger_area_is_ignored(client, user, interest, municipalities):
    body = _create(client, interest, scope="landsdel", scope_code="gotaland", municipality_code="1480").json()
    assert body["municipality_code"] is None and body["scope_code"] == "gotaland"


@pytest.mark.parametrize(
    "changes",
    [
        {"scope": "landsdel"},  # inget område
        {"scope": "kommun"},  # ingen kommun
    ],
)
def test_the_area_is_required(client, user, interest, changes):
    response = _create(client, interest, **changes)
    assert response.status_code == 422
    assert "Välj område för klubben" in str(response.json())


@pytest.mark.parametrize("scope, code", [("landsdel", "lappland"), ("landskap", "99"), ("lan", "88")])
def test_an_unknown_area_is_rejected(client, user, interest, scope, code):
    response = _create(client, interest, scope=scope, scope_code=code)
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt område"


def test_an_unknown_kommun_is_rejected(client, user, interest, municipalities):
    assert _create(client, interest, municipality_code="9999").status_code == 422


def test_the_same_name_is_allowed_in_different_areas_but_not_twice_in_one(client, user, interest, municipalities):
    assert _create(client, interest, municipality_code="1480").status_code == 201
    assert _create(client, interest, scope="lan", scope_code="14").status_code == 201
    again = _create(client, interest, scope="lan", scope_code="14", name="MORGONLÖPARNA")
    assert again.status_code == 409
    assert again.json()["detail"] == "Det finns redan en klubb med det namnet i området"


# --- Hitta -------------------------------------------------------------------


def _club(db, interest, name, **fields):
    owner = User(username=f"owner-{name}", password_hash="x")
    db.add(owner)
    db.flush()
    group = Group(name=name, description="d", interest_id=interest.id, members=[GroupMember(user_id=owner.id, role=GroupRole.owner)], **fields)
    db.add(group)
    db.commit()
    return group


def test_the_kommun_filter_includes_clubs_for_larger_areas_the_kommun_is_in(client, db, user, interest, umea):
    _club(db, interest, "I Göteborg", municipality_code="1480")
    _club(db, interest, "I Mölndal", municipality_code="1481")
    _club(db, interest, "Västra Götaland", scope="lan", scope_code="14")
    _club(db, interest, "Västergötland", scope="landskap", scope_code="7")
    _club(db, interest, "Götaland", scope="landsdel", scope_code="gotaland")
    _club(db, interest, "Sverige", scope="country", scope_code="SE")
    _club(db, interest, "Norrland", scope="landsdel", scope_code="norrland")
    _club(db, interest, "Västerbotten", scope="landskap", scope_code="23")

    names = lambda code: sorted(g["name"] for g in client.get(f"/groups/?municipality_code={code}").json())  # noqa: E731
    assert names("1480") == ["Götaland", "I Göteborg", "Sverige", "Västergötland", "Västra Götaland"]
    assert names("2480") == ["Norrland", "Sverige", "Västerbotten"]
    assert len(client.get("/groups/").json()) == 8


def test_regions_lists_the_areas(client, user):
    data = client.get("/groups/regions").json()
    assert [r["namn"] for r in data["landsdelar"]] == ["Götaland", "Svealand", "Norrland"]
    assert len(data["landskap"]) == 25 and len(data["lan"]) == 21
    assert data["kommuner"]["2480"] == {"lan": "24", "landskap": "23"}


# --- Nivå och max antal medlemmar (SCRUM-216) --------------------------------


def test_level_and_max_members_are_optional_and_shown(client, user, interest, municipalities):
    plain = _create(client, interest, municipality_code="1480").json()
    assert plain["skill_level"] is None and plain["max_members"] is None and plain["is_full"] is False
    body = _create(client, interest, municipality_code="1481", skill_level="beginner", max_members=5).json()
    assert (body["skill_level"], body["max_members"], body["is_full"]) == ("beginner", 5, False)


@pytest.mark.parametrize("value", [0, 1, 1001])
def test_max_members_must_be_reasonable(client, user, interest, municipalities, value):
    response = _create(client, interest, municipality_code="1480", max_members=value)
    assert response.status_code == 422
    assert "Max antal medlemmar ska vara mellan 2 och 1000" in str(response.json())


def test_a_full_club_cannot_be_joined(client, db, user, interest, municipalities):
    group = _club(db, interest, "Full", municipality_code="1480", max_members=1)
    response = client.put(f"/groups/{group.id}/members/me")
    assert response.status_code == 409
    assert response.json()["detail"] == "Klubben är full"
    assert client.get(f"/groups/{group.id}").json()["is_full"] is True


def test_a_club_with_room_can_be_joined_until_it_is_full(client, db, user, interest, municipalities):
    group = _club(db, interest, "Två platser", municipality_code="1480", max_members=2)
    body = client.put(f"/groups/{group.id}/members/me").json()
    assert body["is_member"] is True and body["is_full"] is True
