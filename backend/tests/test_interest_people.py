"""GET /interests/{id}/people: hur många och vilka som har ett intresse (eller något underintresse), med antal för hela landet
och den valda kommunen på intresset, dess överintressen och ett steg ner."""

from datetime import datetime, timedelta, timezone

import pytest

from app.crud.contact import block_user
from app.models import Interest, Suspension, User
from tests.helpers import make_profile


@pytest.fixture
def tree(db):
    """Musik > Rock > Metal, Musik > Jazz, och Sport > Löpning. Rock har Metal under sig."""
    musik, sport = Interest(name="Musik", slug="musik"), Interest(name="Sport", slug="sport")
    db.add_all([musik, sport])
    db.flush()
    rock = Interest(name="Rock", slug="rock", parent_id=musik.id)
    jazz = Interest(name="Jazz", slug="jazz", parent_id=musik.id)
    running = Interest(name="Löpning", slug="lopning", parent_id=sport.id)
    db.add_all([rock, jazz, running])
    db.flush()
    metal = Interest(name="Metal", slug="metal", parent_id=rock.id)
    db.add(metal)
    db.commit()
    return {"musik": musik, "sport": sport, "rock": rock, "jazz": jazz, "running": running, "metal": metal}


def person(db, username, name, municipality_code, *interests):
    p = User(username=username, password_hash="unused")
    db.add(p)
    db.commit()
    db.add(make_profile(p.id, name=name, municipality_code=municipality_code))
    db.commit()
    if interests:
        p.interests = list(interests)
        db.commit()
    return p


def get(client, interest, **params):
    return client.get(f"/interests/{interest.id}/people", params=params)


def counts(node):
    return (node["country"], node["municipality"])


@pytest.fixture
def people(db, user, municipalities, tree):
    """Tre i Göteborg (1480) och två i Mölndal (1481), och den inloggade (id 1) som har Metal i Göteborg."""
    db.add(make_profile(user.id, name="Jag", municipality_code="1480"))
    user.interests = [tree["metal"]]
    db.commit()
    return {
        "anna": person(db, "anna", "Anna", "1480", tree["metal"]),
        "bertil": person(db, "bertil", "Bertil", "1480", tree["rock"]),
        "cecilia": person(db, "cecilia", "Cecilia", "1480", tree["jazz"], tree["metal"]),  # två grenar: räknas en gång på Musik
        "david": person(db, "david", "David", "1481", tree["metal"]),
        "erik": person(db, "erik", "Erik", "1481", tree["running"]),
    }


def test_the_count_includes_every_sub_interest_and_a_person_counts_once(client, tree, people):
    body = get(client, tree["musik"]).json()
    # Anna, Bertil, Cecilia (Jazz och Metal) och David har något under Musik. Erik springer, och du själv räknas inte.
    assert counts(body["interest"]) == (4, None)
    assert [p["name"] for p in body["people"]] == ["Anna", "Bertil", "Cecilia", "David"]


def test_every_level_has_its_own_count(client, tree, people):
    body = get(client, tree["rock"]).json()
    assert body["interest"]["name"] == "Rock" and body["interest"]["path"] == ["Musik"]
    assert counts(body["interest"]) == (4, None)  # Rock och Metal: Anna, Bertil, Cecilia, David
    assert [(a["name"], a["country"]) for a in body["ancestors"]] == [("Musik", 4)]
    assert [(c["name"], c["country"], c["has_children"]) for c in body["children"]] == [("Metal", 3, False)]


def test_the_chain_above_runs_from_the_main_area_down(client, tree, people):
    body = get(client, tree["metal"]).json()
    assert [(a["name"], a["country"]) for a in body["ancestors"]] == [("Musik", 4), ("Rock", 4)]
    assert body["children"] == [] and counts(body["interest"]) == (3, None)


def test_the_chosen_municipality_applies_to_every_level_and_the_list(client, tree, people):
    body = get(client, tree["rock"], municipality_code="1480").json()
    assert body["municipality"] == {"code": "1480", "name": "Göteborg"}
    assert counts(body["interest"]) == (4, 3)  # landet och Göteborg: Anna, Bertil, Cecilia
    assert [(a["name"], a["country"], a["municipality"]) for a in body["ancestors"]] == [("Musik", 4, 3)]
    assert [(c["name"], c["country"], c["municipality"]) for c in body["children"]] == [("Metal", 3, 2)]
    assert [p["name"] for p in body["people"]] == ["Anna", "Bertil", "Cecilia"]  # bara Göteborg


def test_a_municipality_with_nobody_gives_zero_and_an_empty_list(client, tree, people, db):
    from app.models import Municipality

    db.add(Municipality(code="0180", name="Stockholm"))
    db.commit()
    body = get(client, tree["musik"], municipality_code="0180").json()
    assert counts(body["interest"]) == (4, 0) and body["people"] == []


def test_an_unknown_municipality_gives_422(client, tree, people):
    assert get(client, tree["musik"], municipality_code="9999").status_code == 422


def test_blocking_hides_a_person_in_both_directions_and_in_the_count(client, db, user, tree, people):
    block_user(db, user.id, people["anna"].id)  # du blockar Anna
    block_user(db, people["bertil"].id, user.id)  # Bertil blockar dig
    body = get(client, tree["musik"]).json()
    assert counts(body["interest"]) == (2, None) and [p["name"] for p in body["people"]] == ["Cecilia", "David"]


def test_a_suspended_person_is_hidden(client, db, tree, people):
    db.add(Suspension(user_id=people["anna"].id, starts_at=datetime.now(timezone.utc) - timedelta(days=1), until=None, reason="annat"))
    db.commit()
    body = get(client, tree["musik"]).json()
    assert counts(body["interest"]) == (3, None) and "Anna" not in [p["name"] for p in body["people"]]


def test_a_person_you_removed_as_a_suggestion_is_still_counted(client, db, user, tree, people):
    from app.models import DismissedSuggestion

    db.add(DismissedSuggestion(user_id=user.id, dismissed_user_id=people["anna"].id))
    db.commit()
    assert counts(get(client, tree["musik"]).json()["interest"]) == (4, None)


def test_the_list_is_paginated_but_the_count_is_not(client, tree, people):
    body = get(client, tree["musik"], limit=2, offset=1).json()
    assert counts(body["interest"]) == (4, None) and [p["name"] for p in body["people"]] == ["Bertil", "Cecilia"]


def test_a_person_card_never_shows_private_fields(client, tree, people):
    card = get(client, tree["musik"]).json()["people"][0]
    assert set(card) == {"id", "username", "name", "age", "municipality_name", "district", "image_url", "interests"}


def test_an_unknown_interest_gives_404(client, people):
    assert client.get("/interests/9999/people").status_code == 404


def test_someone_elses_own_interest_with_few_users_is_hidden_with_404(client, db, tree, people):
    own = Interest(name="Kubbspelet", parent_id=tree["sport"].id, source="user_suggestion", created_by_user_id=people["erik"].id)
    db.add(own)
    db.commit()
    assert get(client, own).status_code == 404


def test_login_is_required(client, tree):
    assert client.get(f"/interests/{tree['musik'].id}/people").status_code == 401


def test_the_people_list_on_personer_is_unchanged(client, tree, people):
    names = [p["name"] for p in client.get("/users/", params={"interest_id": tree["rock"].id}).json()]
    assert names == ["Bertil"]  # bara exakt intresset, som förut


def count_queries(db, call):
    from sqlalchemy import event

    statements = []
    engine = db.get_bind()

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        call()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return statements


def test_the_number_of_queries_depends_on_the_levels_shown_and_not_on_the_number_of_people(client, db, tree, people):
    first = len(count_queries(db, lambda: get(client, tree["musik"], municipality_code="1480")))
    for i in range(20):  # fler personer ska inte ge fler frågor
        person(db, f"extra{i}", f"Extra {i}", "1480", tree["metal"])
    second = len(count_queries(db, lambda: get(client, tree["musik"], municipality_code="1480")))
    assert first == second
    assert second <= 16  # ett fast antal (intresset, kommunen, blockeringar, trädet, barnen, en för alla räkningar och listan med sina inladdningar)


def test_more_sub_interests_do_not_give_more_queries(client, db, tree, people):
    first = len(count_queries(db, lambda: get(client, tree["musik"])))
    for i in range(15):
        db.add(Interest(name=f"Genre {i}", slug=f"genre-{i}", parent_id=tree["musik"].id))
    db.commit()
    assert len(count_queries(db, lambda: get(client, tree["musik"]))) == first
