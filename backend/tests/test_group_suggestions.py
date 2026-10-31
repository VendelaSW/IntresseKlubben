"""Fler klubbförslag (SCRUM-240): Förslag tar med klubbar för intressen nära ens egna i trädet, och de närmaste
klubbarna kommer först."""

import pytest

from app.models import Interest, Municipality, User
from app.models.group import Group, GroupMember, GroupRole, GroupVisibility
from tests.helpers import make_profile

OWNER = 2


@pytest.fixture
def tree(db):
    """Sport och träning > Löpning > Maraton, Sport och träning > Tennis, och Sällskapsspel > Schack."""
    sport = Interest(name="Sport och träning", slug="sport-och-traning")
    spel = Interest(name="Sällskapsspel", slug="sallskapsspel")
    db.add_all([sport, spel])
    db.flush()
    lopning = Interest(name="Löpning", slug="lopning", parent_id=sport.id)
    tennis = Interest(name="Tennis", slug="tennis", parent_id=sport.id)
    schack = Interest(name="Schack", slug="schack", parent_id=spel.id)
    db.add_all([lopning, tennis, schack])
    db.flush()
    maraton = Interest(name="Maraton", slug="maraton", parent_id=lopning.id)
    db.add(maraton)
    db.commit()
    return {"sport": sport, "lopning": lopning, "tennis": tennis, "schack": schack, "maraton": maraton}


@pytest.fixture
def me(db, user, municipalities):
    """Jag bor i Göteborg (1480, Västra Götalands län) och gillar Löpning. En annan användare äger klubbarna."""
    db.add(Municipality(code="0180", name="Stockholm"))
    db.add(make_profile(user.id, name="Jag", municipality_code="1480"))
    db.add(User(id=OWNER, username="agare", password_hash="x"))
    db.commit()
    return user


def _club(db, name, interest, scope="kommun", scope_code="1480", visibility=GroupVisibility.public):
    group = Group(
        name=name,
        description="En klubb",
        interest_id=interest.id,
        scope=scope,
        scope_code=scope_code,
        municipality_code=scope_code if scope == "kommun" else None,
        visibility=visibility,
        created_by=OWNER,
    )
    group.members.append(GroupMember(user_id=OWNER, role=GroupRole.owner))
    db.add(group)
    db.commit()
    return group


def _like(db, user, *interests):
    user.interests.extend(interests)
    db.commit()


def _suggested(client):
    return [g["name"] for g in client.get("/groups/suggested").json()]


def test_clubs_for_interests_near_mine_are_suggested_closest_first(client, db, me, tree):
    _like(db, me, tree["lopning"])
    _club(db, "Löpare i Stockholm", tree["lopning"], scope_code="0180")
    _club(db, "Tennis i Mölndal", tree["tennis"], scope_code="1481")
    _club(db, "Maraton i hela Sverige", tree["maraton"], scope="country", scope_code="SE")
    _club(db, "Träning i Göteborg", tree["sport"])
    _club(db, "Löpare i Göteborg", tree["lopning"])
    _club(db, "Schack i Göteborg", tree["schack"])

    assert _suggested(client) == [
        # I min kommun: samma intresse först, sedan intresset ovanför (Löpning -> Sport och träning).
        "Löpare i Göteborg",
        "Träning i Göteborg",
        # I mitt län eller för ett större område: ett intresse under mitt före ett annat i samma huvudområde.
        "Maraton i hela Sverige",
        "Tennis i Mölndal",
        # Längre bort.
        "Löpare i Stockholm",
    ]


def test_equally_good_clubs_are_in_swedish_order(client, db, me, tree):
    _like(db, me, tree["lopning"])
    for name in ("Östra löparna", "Älvlöparna", "Ålöparna", "Löparna"):
        _club(db, name, tree["lopning"])
    assert _suggested(client) == ["Löparna", "Ålöparna", "Älvlöparna", "Östra löparna"]


def test_an_unrelated_interest_is_not_suggested(client, db, me, tree):
    _like(db, me, tree["lopning"])
    _club(db, "Schack i Göteborg", tree["schack"])
    assert _suggested(client) == []


def test_a_main_area_suggests_everything_under_it(client, db, me, tree):
    _like(db, me, tree["sport"])
    _club(db, "Maraton i Göteborg", tree["maraton"])
    _club(db, "Tennis i Göteborg", tree["tennis"])
    assert _suggested(client) == ["Maraton i Göteborg", "Tennis i Göteborg"]


def test_private_clubs_and_my_own_clubs_are_not_suggested(client, db, me, tree):
    _like(db, me, tree["lopning"])
    _club(db, "Privat löpning", tree["lopning"], visibility=GroupVisibility.private)
    mine = _club(db, "Min löpning", tree["lopning"])
    mine.members.append(GroupMember(user_id=me.id, role=GroupRole.member))
    db.commit()
    assert _suggested(client) == []


def test_no_interests_gives_no_suggestions(client, db, me, tree):
    _club(db, "Löpare i Göteborg", tree["lopning"])
    assert _suggested(client) == []
