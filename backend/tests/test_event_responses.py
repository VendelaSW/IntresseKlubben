from datetime import date

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import EventInvitation, EventResponse, Interest, Profile, User
from app.models.event import EventVisibility
from app.models.group import GroupVisibility
from tests.event_helpers import add_contact, add_event, add_group


@pytest.fixture(autouse=True)
def interest(db):
    row = Interest(id=1, name="Löpning")
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def people(db, user, municipalities):
    """Användare 2–4. testuser (id 1) är den inloggade i början av varje test."""
    users = [User(id=i, username=f"user{i}", password_hash="unused") for i in (2, 3, 4)]
    db.add_all(users)
    db.commit()
    return {u.username: u for u in users}


def login_as(person):
    app.dependency_overrides[get_current_user] = lambda: person


def answer(client, event, value):
    return client.put(f"/events/{event.id}/response", json={"answer": value})


def responses(client, event):
    return client.get(f"/events/{event.id}/responses")


def answers(response):
    return {r["username"]: r["answer"] for r in response.json()}


def invite(db, event, person):
    db.add(EventInvitation(event_id=event.id, user_id=person.id))
    db.commit()


# ---------- Svara ----------


def test_answer_an_open_event_and_change_the_answer(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)

    response = answer(client, event, "maybe")
    assert response.status_code == 200
    assert answers(response) == {"testuser": "maybe"}

    # Ett nytt svar byter ut det gamla, det blir ingen andra rad.
    assert answers(answer(client, event, "yes")) == {"testuser": "yes"}
    assert answers(answer(client, event, "yes")) == {"testuser": "yes"}
    assert db.query(EventResponse).count() == 1


@pytest.mark.parametrize("value", ["ja", "", None, "YES"])
def test_only_yes_maybe_and_no_are_accepted(client, db, user, people, value):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)
    assert answer(client, event, value).status_code == 422
    assert db.query(EventResponse).count() == 0


def test_creator_can_answer_their_own_event(client, db, user, people):
    event = add_event(db, user.id)
    assert answers(answer(client, event, "yes")) == {"testuser": "yes"}


def test_cannot_answer_a_private_event_you_cannot_see(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.invite_only)
    response = answer(client, event, "yes")
    assert response.status_code == 404
    assert response.json()["detail"] == "Eventet finns inte"
    assert client.put("/events/99999/response", json={"answer": "yes"}).status_code == 404
    assert db.query(EventResponse).count() == 0


def test_invited_user_can_answer_a_private_event(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.invite_only)
    invite(db, event, user)
    assert answer(client, event, "no").status_code == 200


def test_club_member_can_answer_the_clubs_private_event(client, db, user, people):
    group = add_group(db, people["user2"].id, visibility=GroupVisibility.private, members=[user.id])
    event = add_event(db, people["user2"].id, group_id=group.id, visibility=EventVisibility.invite_only)
    assert answer(client, event, "yes").status_code == 200


def test_my_answer_is_included_in_the_event_list(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)
    assert client.get("/events/").json()[0]["my_answer"] is None

    answer(client, event, "maybe")
    answer_in_list = client.get("/events/").json()[0]
    assert answer_in_list["my_answer"] == "maybe"

    # Andras svar är aldrig mitt svar.
    login_as(people["user3"])
    assert client.get("/events/").json()[0]["my_answer"] is None


# ---------- Se svaren ----------


def test_everyone_who_can_see_an_open_event_sees_the_answers(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)
    login_as(people["user3"])
    answer(client, event, "yes")
    login_as(people["user4"])
    answer(client, event, "no")

    # Testuser har inte svarat och är inte inbjuden, men ser ändå svaren.
    login_as(user)
    result = responses(client, event)
    assert result.status_code == 200
    assert answers(result) == {"user3": "yes", "user4": "no"}


def test_responses_are_listed_in_the_order_they_came_in_and_show_public_details_only(
    client, db, user, people
):
    db.add(Profile(user_id=people["user3"].id, name="Tre", municipality_code="1480",
                   birth_date=date(1990, 1, 1), gender="annat", profile_text="Hej"))
    db.commit()
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)
    login_as(people["user3"])
    answer(client, event, "maybe")
    login_as(people["user4"])
    answer(client, event, "yes")
    login_as(people["user3"])
    answer(client, event, "no")  # byter svar, hamnar ändå först

    result = responses(client, event).json()
    assert [r["username"] for r in result] == ["user3", "user4"]
    assert result[0]["name"] == "Tre"
    assert result[0]["answer"] == "no"
    assert result[1]["name"] is None
    assert set(result[0]) == {"id", "username", "name", "image_url", "answer", "blocked_by_me"}


def test_private_event_answers_are_seen_by_creator_and_invited_but_not_by_others(client, db, user, people):
    event = add_event(db, user.id, visibility=EventVisibility.invite_only)
    invite(db, event, people["user2"])
    invite(db, event, people["user3"])
    login_as(people["user2"])
    answer(client, event, "yes")
    login_as(people["user3"])
    answer(client, event, "maybe")

    # Den andra inbjudna ser alla svar, inte bara sitt eget.
    assert answers(responses(client, event)) == {"user2": "yes", "user3": "maybe"}
    login_as(user)
    assert answers(responses(client, event)) == {"user2": "yes", "user3": "maybe"}

    login_as(people["user4"])
    hidden = responses(client, event)
    assert hidden.status_code == 404
    assert hidden.json()["detail"] == "Eventet finns inte"


def test_removing_an_invitation_also_hides_the_answers(client, db, user, people):
    event = add_event(db, user.id, visibility=EventVisibility.invite_only)
    invite(db, event, people["user2"])
    login_as(people["user2"])
    answer(client, event, "yes")

    login_as(user)
    assert client.delete(f"/events/{event.id}/invitations/user2").status_code == 204
    login_as(people["user2"])
    assert responses(client, event).status_code == 404


def test_no_answers_gives_an_empty_list(client, db, user, people):
    event = add_event(db, user.id)
    assert responses(client, event).json() == []


def flags(response):
    return {r["username"]: r["blocked_by_me"] for r in response.json()}


def test_people_i_have_blocked_are_shown_with_a_warning_flag(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)
    login_as(people["user3"])
    answer(client, event, "yes")
    login_as(user)
    answer(client, event, "maybe")
    assert flags(responses(client, event)) == {"testuser": False, "user3": False}

    # Jag blockerar user3: hen syns fortfarande, så att jag inte går på ett event
    # utan att veta att hen kommer, men med flaggan som visar varningen.
    add_contact(db, user.id, people["user3"].id, status="BLOCKED")
    result = responses(client, event)
    assert answers(result) == {"testuser": "maybe", "user3": "yes"}
    assert flags(result) == {"testuser": False, "user3": True}
    # Samma när jag svarar på nytt.
    assert flags(answer(client, event, "yes")) == {"testuser": False, "user3": True}


def test_people_who_have_blocked_me_stay_hidden_without_a_warning(client, db, user, people):
    event = add_event(db, people["user2"].id, visibility=EventVisibility.open)
    login_as(people["user4"])
    answer(client, event, "no")
    login_as(user)
    answer(client, event, "maybe")

    # user4 blockerar mig: hen försvinner för mig, helt utan spår. Annars förstår
    # jag att jag är blockerad.
    add_contact(db, people["user4"].id, user.id, status="BLOCKED")
    assert answers(responses(client, event)) == {"testuser": "maybe"}
    assert answers(answer(client, event, "yes")) == {"testuser": "yes"}

    # För user4, som har blockerat mig, är det jag som är den blockerade: jag syns
    # med varningen.
    login_as(people["user4"])
    result = responses(client, event)
    assert answers(result) == {"testuser": "yes", "user4": "no"}
    assert flags(result) == {"testuser": True, "user4": False}
