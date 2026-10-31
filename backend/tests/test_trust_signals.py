"""Förtroendesignaler på profiler (SCRUM-219): GET /users/{id}/profile säger om e-posten är bekräftad, när kontot
skapades, och vilka kompisar och klubbar man har gemensamt med personen."""

import pytest

from app.crud.moderation import suspend_user
from app.models import User
from app.models.email_token import utc_now
from app.models.group import GroupVisibility
from tests.event_helpers import add_contact, add_group
from tests.helpers import make_profile

OTHER = 2


@pytest.fixture
def people(db, user, municipalities):
    """Jag (1) och den vars profil jag tittar på (2), plus fem till (3-7) med namn."""
    db.add(make_profile(user.id, name="Jag"))
    db.add_all(User(id=i, username=f"user{i}", password_hash="x") for i in range(2, 8))
    db.flush()
    names = {2: "Cecilia", 3: "Bertil", 4: "Maja", 5: "Omar", 6: "Pia", 7: "Rut"}
    db.add_all(make_profile(i, name=name) for i, name in names.items())
    db.commit()
    return user


def _profile(client, user_id=OTHER):
    response = client.get(f"/users/{user_id}/profile")
    assert response.status_code == 200
    return response.json()


def test_a_confirmed_email_and_the_month_the_account_was_made(client, db, people):
    other = db.get(User, OTHER)
    other.email = "cecilia@example.com"
    other.email_verified_at = utc_now()
    db.commit()

    body = _profile(client)

    assert body["email_verified"] is True
    assert body["member_since"] == other.created_at.strftime("%Y-%m")  # bara månaden, inte exakt när
    assert "cecilia@example.com" not in str(body)  # bara att den är bekräftad, aldrig adressen


def test_an_unconfirmed_email_is_false(client, db, people):
    assert _profile(client)["email_verified"] is False


def test_only_friends_we_both_have_are_shown(client, db, people):
    for friend in (3, 4):  # Bertil och Maja är kompis med oss båda
        add_contact(db, people.id, friend)
        add_contact(db, friend, OTHER)
    add_contact(db, people.id, 5)  # Omar är bara min kompis
    add_contact(db, OTHER, 6)  # Pia är bara Cecilias kompis
    add_contact(db, people.id, 7, status="PENDING")  # Rut har jag bara skickat en förfrågan till
    add_contact(db, 7, OTHER)

    assert sorted(_profile(client)["mutual_friends"]) == ["Bertil", "Maja"]


def test_a_suspended_mutual_friend_is_not_shown(client, db, people):
    add_contact(db, people.id, 3)
    add_contact(db, 3, OTHER)
    suspend_user(db, 3, 7, "spam", moderator_id=4)
    assert _profile(client)["mutual_friends"] == []


def test_clubs_we_are_both_in_are_shown_also_private_ones(client, db, people):
    add_group(db, 4, visibility=GroupVisibility.private, members=[people.id, OTHER], name="Hemliga klubben")
    add_group(db, 4, members=[people.id], name="Bara min")
    add_group(db, 4, members=[OTHER], name="Bara Cecilias")

    assert _profile(client)["shared_clubs"] == ["Hemliga klubben"]


def test_my_own_profile_has_no_mutual_friends_or_clubs(client, db, people):
    add_contact(db, people.id, 3)
    add_group(db, 4, members=[people.id], name="Min klubb")

    body = _profile(client, people.id)

    assert body["mutual_friends"] == [] and body["shared_clubs"] == []
