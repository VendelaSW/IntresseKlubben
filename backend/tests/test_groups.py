from datetime import date, datetime, timezone

import pytest

from app.auth.security import get_current_user
from app.crud.group import MAX_MEMBERSHIPS
from app.main import app
from app.models import Group, GroupMember, Interest, User
from tests.helpers import make_profile


@pytest.fixture
def interests(db):
    items = [Interest(name="Löpning"), Interest(name="Schack")]
    db.add_all(items)
    db.commit()
    return {i.name: i.id for i in items}


@pytest.fixture
def login_as(db, user):
    """Byter inloggad användare. Testet börjar inloggat som `user` ("testuser")."""

    def _login_as(username: str) -> User:
        other = db.query(User).filter_by(username=username).first()
        if other is None:
            other = User(username=username, password_hash="unused")
            db.add(other)
            db.commit()
        app.dependency_overrides[get_current_user] = lambda: other
        return other

    return _login_as


def _payload(interests, **changes) -> dict:
    return {
        "name": "Morgonlöparna",
        "description": "Lugna rundor före jobbet.",
        "interest_id": interests["Löpning"],
        "municipality_code": "1480",
        **changes,
    }


@pytest.fixture
def new_group(client, interests, municipalities):
    """Skapar en grupp som den inloggade användaren och returnerar svaret."""

    def _new_group(**changes) -> dict:
        response = client.post("/groups/", json=_payload(interests, **changes))
        assert response.status_code == 201, response.json()
        return response.json()

    return _new_group


# --- Skapa -------------------------------------------------------------------


def test_create_group_makes_creator_owner(client, user, new_group):
    group = new_group(name="  Morgonlöparna  ", meeting_info="Tisdagar 06.30")
    assert group["name"] == "Morgonlöparna"
    assert group["interest_name"] == "Löpning"
    assert group["municipality_name"] == "Göteborg"
    assert group["visibility"] == "public"
    assert group["member_count"] == 1
    assert group["is_owner"] is True
    assert client.get(f"/groups/{group['id']}").json() == group


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"name": "x" * 31}, "Namn får max vara 30 tecken"),
        ({"description": "  "}, "Beskrivning får inte vara tom"),
        ({"interest_id": 9999}, "Okänt intresse"),
        ({"municipality_code": "0000"}, "Okänd kommun"),
    ],
)
def test_create_group_rejects_invalid_input(client, user, interests, municipalities, changes, message):
    response = client.post("/groups/", json=_payload(interests, **changes))
    assert response.status_code == 422
    # Valideringsfel kommer som en lista, routens egna fel som en sträng.
    detail = response.json()["detail"]
    text = detail if isinstance(detail, str) else detail[0]["msg"].removeprefix("Value error, ")
    assert text == message


def test_create_group_rejects_inactive_interest(client, db, user, interests, municipalities):
    # Ett inaktivt intresse (t.ex. Gaming, som slogs ihop med Tv-spel) går inte
    # att välja, inte heller via API:t. Samma fel som ett okänt.
    gaming = Interest(name="Gaming", status="inactive")
    db.add(gaming)
    db.commit()
    response = client.post("/groups/", json=_payload(interests, interest_id=gaming.id))
    assert response.status_code == 422
    assert response.json()["detail"] == "Okänt intresse"


def test_same_name_in_same_municipality_is_not_allowed(client, user, new_group, interests):
    new_group()
    response = client.post("/groups/", json=_payload(interests, name="MORGONLÖPARNA"))
    assert response.status_code == 409
    assert response.json()["detail"] == "Det finns redan en klubb med det namnet i kommunen"


# --- Lista -------------------------------------------------------------------


def test_list_shows_public_groups_with_filters(client, user, new_group, interests):
    new_group(name="Löpare Göteborg")
    new_group(name="Löpare Mölndal", municipality_code="1481")
    new_group(name="Schack Göteborg", interest_id=interests["Schack"])
    new_group(name="Hemlig", visibility="private")

    def names(params=None):
        return [g["name"] for g in client.get("/groups/", params=params).json()]

    assert names() == ["Löpare Göteborg", "Löpare Mölndal", "Schack Göteborg"]
    assert names({"interest_id": interests["Löpning"]}) == ["Löpare Göteborg", "Löpare Mölndal"]
    assert names({"municipality_code": "1480"}) == ["Löpare Göteborg", "Schack Göteborg"]


def _names(client, **params) -> list[str]:
    response = client.get("/groups/", params=params)
    assert response.status_code == 200, response.json()
    return [g["name"] for g in response.json()]


def test_search_finds_name_or_description_ignoring_case(client, user, new_group):
    new_group(name="Morgonlöparna", description="Lugna rundor före jobbet.")
    new_group(name="Kvällsgänget", description="Vi springer MORGON och kväll.")
    new_group(name="Schackklubben", description="Brädspel varje vecka.")

    assert _names(client, q="morgon") == ["Kvällsgänget", "Morgonlöparna"]
    # Versaler utan å/ä/ö: testernas SQLite gör bara a-z till gemener (Postgres gör alla).
    assert _names(client, q="  VARJE VECKA ") == ["Schackklubben"]
    assert _names(client, q="finns inte") == []
    # Tom sökning är samma som ingen sökning.
    assert len(_names(client, q="  ")) == 3


def test_search_works_together_with_the_filters(client, user, new_group, interests):
    new_group(name="Löpare Göteborg")
    new_group(name="Löpare Mölndal", municipality_code="1481")
    new_group(name="Schackande löpare", interest_id=interests["Schack"])

    assert _names(client, q="löpare", municipality_code="1480") == ["Löpare Göteborg", "Schackande löpare"]
    assert _names(client, q="löpare", interest_id=interests["Löpning"]) == ["Löpare Göteborg", "Löpare Mölndal"]


def test_search_treats_percent_and_underscore_as_text(client, user, new_group):
    new_group(name="100% löpning")
    new_group(name="Löpning 1000")
    new_group(name="Snake_case", description="Programmering")
    new_group(name="Snakes", description="Ormar")

    assert _names(client, q="0%") == ["100% löpning"]
    assert _names(client, q="e_c") == ["Snake_case"]


def test_sort_by_name_is_the_default(client, user, new_group):
    for name in ["Cirkeln", "Aftonen", "Bryggan"]:
        new_group(name=name)

    assert _names(client) == ["Aftonen", "Bryggan", "Cirkeln"]
    assert _names(client, sort="name") == ["Aftonen", "Bryggan", "Cirkeln"]


def test_sort_by_most_members(client, user, new_group, login_as):
    login_as("skapare")
    one = new_group(name="Aftonen")
    three = new_group(name="Bryggan")
    two = new_group(name="Cirkeln")
    for username, group_ids in {"a": [three["id"], two["id"]], "b": [three["id"]]}.items():
        login_as(username)
        for group_id in group_ids:
            client.put(f"/groups/{group_id}/members/me")
    login_as("testuser")

    assert _names(client, sort="members") == ["Bryggan", "Cirkeln", "Aftonen"]
    assert one["member_count"] == 1


def test_sort_by_members_does_not_count_blocked_users(client, user, new_group, login_as):
    login_as("skapare")
    new_group(name="Aftonen")
    bryggan = new_group(name="Bryggan")
    # Bryggan har en medlem fler, men det är någon testuser har blockerat.
    login_as("blockerad")
    client.put(f"/groups/{bryggan['id']}/members/me")
    login_as("testuser")
    assert client.post("/users/blockerad/block").status_code in (200, 201)

    groups = client.get("/groups/", params={"sort": "members"}).json()

    # Lika många synliga medlemmar, så namnet avgör, och antalet stämmer med ordningen.
    assert [(g["name"], g["member_count"]) for g in groups] == [("Aftonen", 1), ("Bryggan", 1)]


def test_sort_by_newest(client, db, user, new_group):
    created = {
        "Aftonen": datetime(2026, 3, 1, tzinfo=timezone.utc),
        "Bryggan": datetime(2026, 9, 1, tzinfo=timezone.utc),
        "Cirkeln": datetime(2026, 6, 1, tzinfo=timezone.utc),
    }
    for name, created_at in created.items():
        db.get(Group, new_group(name=name)["id"]).created_at = created_at
    db.commit()

    assert _names(client, sort="newest") == ["Bryggan", "Cirkeln", "Aftonen"]


@pytest.mark.parametrize("sort", ["name", "members", "newest"])
def test_reverse_is_the_same_order_backwards(client, db, user, new_group, login_as, sort):
    # Olika antal medlemmar och skapad-tider, och två med lika av båda, så
    # att både sorteringen och det som avgör vid lika vänds.
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for name in ["Aftonen", "Bryggan", "Cirkeln", "Dalen"]:
        group_id = new_group(name=name)["id"]
        db.get(Group, group_id).created_at = created if name in ("Cirkeln", "Dalen") else datetime(
            2026, 1 + len(name) % 5, 2, tzinfo=timezone.utc
        )
    db.commit()
    login_as("medlem")
    bryggan = next(g for g in client.get("/groups/").json() if g["name"] == "Bryggan")
    client.put(f"/groups/{bryggan['id']}/members/me")
    login_as("testuser")

    forwards = _names(client, sort=sort)

    assert _names(client, sort=sort, reverse="true") == forwards[::-1]
    # Sidorna fungerar likadant baklänges.
    pages = [_names(client, sort=sort, reverse="true", limit=3, offset=offset) for offset in (0, 3)]
    assert [name for page in pages for name in page] == forwards[::-1]


def test_unknown_sort_gives_422(client, user):
    response = client.get("/groups/", params={"sort": "random"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Ogiltigt värde"


@pytest.mark.parametrize("sort", ["name", "members", "newest"])
def test_pages_cover_every_group_once(client, user, new_group, sort):
    # Samma antal medlemmar och samma skapad-tid, så att bara id skiljer dem
    # åt i "members" och "newest" - ordningen måste ändå vara stabil.
    for name in ["Ett", "Två", "Tre", "Fyra", "Fem"]:
        new_group(name=name)

    pages = [_names(client, sort=sort, limit=2, offset=offset) for offset in (0, 2, 4, 6)]

    assert [len(page) for page in pages] == [2, 2, 1, 0]
    assert [name for page in pages for name in page] == _names(client, sort=sort)


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"limit": 0}, "Får inte vara lägre än 1"),
        ({"limit": 101}, "Får inte vara högre än 100"),
        ({"offset": -1}, "Får inte vara lägre än 0"),
    ],
)
def test_invalid_limit_or_offset_gives_422(client, user, params, message):
    response = client.get("/groups/", params=params)

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == message


def test_private_groups_never_show_up_when_searching_sorting_or_paging(client, user, new_group, login_as):
    login_as("skapare")
    new_group(name="Hemliga löparna", visibility="private")
    new_group(name="Öppna löparna")
    login_as("testuser")

    for sort in ["name", "members", "newest"]:
        assert _names(client, q="löparna", sort=sort, limit=10, offset=0) == ["Öppna löparna"]


def test_exclude_mine_leaves_out_groups_i_am_in(client, user, new_group, login_as):
    new_group(name="Min egen")
    login_as("skapare")
    joined = new_group(name="Redan med")
    new_group(name="Inte med")
    login_as("testuser")
    client.put(f"/groups/{joined['id']}/members/me")

    assert _names(client, exclude_mine="true") == ["Inte med"]
    assert _names(client) == ["Inte med", "Min egen", "Redan med"]


def test_private_group_is_only_visible_to_members(client, user, new_group, login_as):
    group = new_group(name="Hemlig", visibility="private")
    assert [g["name"] for g in client.get("/groups/mine").json()] == ["Hemlig"]

    login_as("annan")
    assert client.get(f"/groups/{group['id']}").status_code == 404
    assert client.put(f"/groups/{group['id']}/members/me").status_code == 404


def test_suggested_matches_my_interests_and_skips_my_groups(client, db, user, new_group, interests, login_as):
    login_as("skapare")
    new_group(name="Löpning öppen")
    joined = new_group(name="Löpning redan med")
    new_group(name="Schack öppen", interest_id=interests["Schack"])

    me = login_as("testuser")
    me.interests.append(db.get(Interest, interests["Löpning"]))
    db.commit()
    client.put(f"/groups/{joined['id']}/members/me")

    assert [g["name"] for g in client.get("/groups/suggested").json()] == ["Löpning öppen"]


# --- Gå med ------------------------------------------------------------------


def test_join_group_only_once(client, user, new_group, login_as):
    group = new_group()
    login_as("annan")
    client.put(f"/groups/{group['id']}/members/me")
    body = client.put(f"/groups/{group['id']}/members/me").json()
    assert body["member_count"] == 2
    assert body["is_member"] is True
    assert body["is_owner"] is False


def test_user_can_be_member_of_at_most_max_groups(client, db, user, interests, municipalities, login_as):
    owner = login_as("skapare")
    groups = [
        Group(name=f"Grupp {i}", description="Test.", interest_id=interests["Löpning"],
              municipality_code="1480", members=[GroupMember(user_id=owner.id, role="owner")])
        for i in range(MAX_MEMBERSHIPS + 1)
    ]
    db.add_all(groups)
    db.commit()

    login_as("testuser")
    for group in groups[:MAX_MEMBERSHIPS]:
        client.put(f"/groups/{group.id}/members/me")
    response = client.put(f"/groups/{groups[-1].id}/members/me")
    assert response.status_code == 409
    assert response.json()["detail"] == f"Du kan vara med i max {MAX_MEMBERSHIPS} klubbar"


# --- Gå ur och radera --------------------------------------------------------


def test_owner_leaving_hands_over_to_longest_member_and_last_one_deletes_group(client, user, new_group, login_as):
    group = new_group()
    path = f"/groups/{group['id']}"
    login_as("forst")
    client.put(f"{path}/members/me")
    login_as("sedan")
    client.put(f"{path}/members/me")

    login_as("testuser")
    assert client.delete(f"{path}/members/me").status_code == 204
    login_as("forst")
    assert client.get(path).json()["is_owner"] is True

    client.delete(f"{path}/members/me")
    login_as("sedan")
    assert client.get(path).json()["is_owner"] is True
    client.delete(f"{path}/members/me")
    assert client.get(path).status_code == 404


def test_only_owner_can_delete_group(client, user, new_group, login_as):
    group = new_group()
    login_as("annan")
    client.put(f"/groups/{group['id']}/members/me")
    response = client.delete(f"/groups/{group['id']}")
    assert response.status_code == 403
    assert response.json()["detail"] == "Bara ägaren kan radera klubben"

    login_as("testuser")
    assert client.delete(f"/groups/{group['id']}").status_code == 204
    assert client.get(f"/groups/{group['id']}").status_code == 404


# --- Medlemmar ---------------------------------------------------------------


def test_members_lists_public_info_longest_member_first(client, db, user, new_group, login_as):
    group = new_group()
    anna = login_as("anna")
    db.add(make_profile(anna.id, name="Anna Berg", birth_date=date(2000, 1, 1)))
    db.commit()
    client.put(f"/groups/{group['id']}/members/me")

    response = client.get(f"/groups/{group['id']}/members")
    assert response.status_code == 200
    assert response.json() == [
        {"username": "testuser", "name": None, "image_url": None, "role": "owner"},
        {"username": "anna", "name": "Anna Berg", "image_url": None, "role": "member"},
    ]


def test_members_of_public_group_visible_to_non_members(client, user, new_group, login_as):
    group = new_group()
    login_as("annan")
    assert [m["username"] for m in client.get(f"/groups/{group['id']}/members").json()] == ["testuser"]


def test_members_of_private_group_hidden_from_non_members(client, user, new_group, login_as):
    group = new_group(name="Hemlig", visibility="private")
    login_as("annan")
    assert client.get(f"/groups/{group['id']}/members").status_code == 404


def test_members_hides_blocked_users_in_both_directions(client, user, new_group, login_as):
    group = new_group()
    login_as("anna")
    client.put(f"/groups/{group['id']}/members/me")
    assert client.post("/users/testuser/block").status_code in (200, 201)

    # Anna har blockerat testuser: ingen av dem ser den andra i listan.
    assert [m["username"] for m in client.get(f"/groups/{group['id']}/members").json()] == ["anna"]
    login_as("testuser")
    assert [m["username"] for m in client.get(f"/groups/{group['id']}/members").json()] == ["testuser"]
    # Någon annan ser båda.
    login_as("bo")
    assert [m["username"] for m in client.get(f"/groups/{group['id']}/members").json()] == ["testuser", "anna"]
