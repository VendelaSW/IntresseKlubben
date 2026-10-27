"""Events: max antal och nivå (SCRUM-293), område (SCRUM-295), ansökan och medarrangörer (SCRUM-296)."""

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import EventHost, EventJoinRequest, Interest, Notification, User
from app.models.event import EventVisibility
from tests.event_helpers import add_event, payload
from tests.helpers import make_profile

CREATOR, HOST, GUEST = 1, 2, 3


@pytest.fixture
def people(db, user):
    db.add(Interest(id=1, name="Löpning"))
    found = {CREATOR: user}
    db.add(make_profile(CREATOR, name="Anna"))
    for user_id, name in [(HOST, "Hugo"), (GUEST, "Greta")]:
        person = User(id=user_id, username=name.lower(), password_hash="x")
        db.add(person)
        db.flush()
        db.add(make_profile(user_id, name=name))
        found[user_id] = person
    db.commit()
    return found


def login(people, user_id):
    app.dependency_overrides[get_current_user] = lambda: people[user_id]


def answer(client, event_id, value):
    return client.put(f"/events/{event_id}/response", json={"answer": value})


# --- Max antal och nivå (SCRUM-293) -------------------------------------------


def test_level_and_max_are_saved_and_shown(client, people):
    body = client.post("/events/", json=payload(visibility="open", skill_level="beginner", max_attendees=5)).json()
    assert (body["skill_level"], body["max_attendees"], body["yes_count"], body["is_full"]) == ("beginner", 5, 0, False)


@pytest.mark.parametrize("value", [1, 1001])
def test_max_must_be_reasonable(client, people, value):
    assert client.post("/events/", json=payload(max_attendees=value)).status_code == 422


def test_a_full_event_takes_no_more_yes_but_maybe_works(client, db, people):
    event = add_event(db, CREATOR, visibility=EventVisibility.open, max_attendees=2)
    login(people, HOST)
    assert answer(client, event.id, "yes").status_code == 200
    login(people, CREATOR)
    assert answer(client, event.id, "yes").status_code == 200
    login(people, GUEST)
    response = answer(client, event.id, "yes")
    assert response.status_code == 409 and response.json()["detail"] == "Eventet är fullt"
    assert answer(client, event.id, "maybe").status_code == 200
    login(people, HOST)
    assert answer(client, event.id, "yes").status_code == 200  # samma Ja igen går


# --- Område (SCRUM-295) -------------------------------------------------------


def test_an_event_can_cover_a_larger_area(client, people):
    body = client.post("/events/", json=payload(scope="landsdel", scope_code="norrland")).json()
    assert (body["scope"], body["scope_code"], body["scope_name"]) == ("landsdel", "norrland", "Norrland")
    body = client.post("/events/", json=payload(scope="country")).json()
    assert (body["scope_code"], body["scope_name"]) == ("SE", "Hela Sverige")
    assert client.post("/events/", json=payload()).json()["scope"] is None


@pytest.mark.parametrize("changes", [{"scope": "kommun", "scope_code": "1480"}, {"scope": "lan"}, {"scope": "lan", "scope_code": "99"}])
def test_bad_areas_are_rejected(client, people, changes):
    assert client.post("/events/", json=payload(**changes)).status_code == 422


def test_the_area_can_be_changed_and_removed(client, db, people):
    event = add_event(db, CREATOR)
    assert client.patch(f"/events/{event.id}", json={"scope": "lan", "scope_code": "14"}).json()["scope_name"] == "Västra Götalands län"
    assert client.patch(f"/events/{event.id}", json={"scope": None}).json()["scope"] is None


# --- Ansökan (SCRUM-296) ------------------------------------------------------


@pytest.fixture
def applied(client, db, people):
    event = add_event(db, CREATOR, visibility=EventVisibility.application)
    login(people, GUEST)
    return event


def test_an_application_event_is_visible_but_needs_approval(client, db, people, applied):
    assert [e["id"] for e in client.get("/events/").json()] == [applied.id]
    response = answer(client, applied.id, "yes")
    assert response.status_code == 409 and response.json()["detail"] == "Du behöver ansöka för att vara med på eventet"
    body = client.put(f"/events/{applied.id}/requests/me", json={"message": "Får jag följa med?"}).json()
    assert body["has_applied"] is True and body["can_answer"] is False
    note = db.query(Notification).filter_by(user_id=CREATOR).one()
    assert note.quote == "Får jag följa med?"


def test_approving_lets_the_applicant_answer(client, db, people, applied):
    client.put(f"/events/{applied.id}/requests/me", json={})
    login(people, CREATOR)
    assert client.get(f"/events/{applied.id}/requests").json()[0]["user"]["id"] == GUEST
    assert client.put(f"/events/{applied.id}/requests/{GUEST}").status_code == 204
    login(people, GUEST)
    assert answer(client, applied.id, "yes").status_code == 200


def test_declining_explains_and_allows_applying_again(client, db, people, applied):
    client.put(f"/events/{applied.id}/requests/me", json={})
    login(people, CREATOR)
    response = client.request("DELETE", f"/events/{applied.id}/requests/{GUEST}", json={"message": "Fullt i bilen"})
    assert response.status_code == 204
    note = db.query(Notification).filter_by(user_id=GUEST).one()
    assert (note.quote, note.quote_by) == ("Fullt i bilen", "Anna")
    login(people, GUEST)
    assert client.put(f"/events/{applied.id}/requests/me", json={}).json()["has_applied"] is True


def test_withdrawing_removes_the_application(client, db, people, applied):
    client.put(f"/events/{applied.id}/requests/me", json={})
    assert client.delete(f"/events/{applied.id}/requests/me").json()["has_applied"] is False
    assert db.query(EventJoinRequest).count() == 0


def test_an_open_event_takes_no_applications(client, db, people):
    event = add_event(db, CREATOR, visibility=EventVisibility.open)
    login(people, GUEST)
    assert client.put(f"/events/{event.id}/requests/me", json={}).status_code == 409


# --- Medarrangörer (SCRUM-296) ------------------------------------------------


def test_the_creator_makes_an_attendee_a_host_who_can_edit_but_not_delete(client, db, people):
    event = add_event(db, CREATOR, visibility=EventVisibility.open)
    login(people, HOST)
    answer(client, event.id, "yes")
    login(people, CREATOR)
    assert client.put(f"/events/{event.id}/hosts/{HOST}").status_code == 204
    assert client.get("/events/").json()[0]["host_ids"] == [HOST]
    login(people, HOST)
    body = client.patch(f"/events/{event.id}", json={"title": "Ny titel"}).json()
    assert body["title"] == "Ny titel" and body["is_host"] is True
    assert client.delete(f"/events/{event.id}").status_code == 403
    titles = [n.title for n in db.query(Notification).filter_by(user_id=HOST)]
    assert any("medarrangör" in t for t in titles)


def test_a_blocked_host_gets_no_notice_of_an_application(client, db, people, applied):
    from tests.event_helpers import add_contact

    db.add(EventHost(event_id=applied.id, user_id=HOST))
    db.commit()
    add_contact(db, HOST, GUEST, status="BLOCKED")
    client.put(f"/events/{applied.id}/requests/me", json={})
    assert db.query(Notification).filter_by(user_id=CREATOR).count() == 1
    assert db.query(Notification).filter_by(user_id=HOST).count() == 0


def test_a_change_by_a_host_names_the_host_and_skips_them(client, db, people):
    from tests.event_helpers import future

    event = add_event(db, CREATOR, visibility=EventVisibility.open)
    for user_id in (HOST, GUEST):
        login(people, user_id)
        answer(client, event.id, "yes")
    login(people, CREATOR)
    client.put(f"/events/{event.id}/hosts/{HOST}")
    login(people, HOST)
    new_start = future(days=8).isoformat()
    assert client.patch(f"/events/{event.id}", json={"starts_at": new_start}).status_code == 200
    (note,) = db.query(Notification).filter_by(user_id=GUEST).all()
    assert note.body == "Hugo har ändrat eventet som du ska gå på."
    assert db.query(Notification).filter_by(user_id=HOST, kind="event_changed").count() == 0


def test_an_invited_person_who_has_not_answered_cannot_be_a_host(client, db, people):
    from app.models import EventInvitation

    event = add_event(db, CREATOR, visibility=EventVisibility.open)
    db.add(EventInvitation(event_id=event.id, user_id=GUEST))
    db.commit()
    response = client.put(f"/events/{event.id}/hosts/{GUEST}")
    assert response.status_code == 409
    assert response.json()["detail"] == "En medarrangör behöver ha svarat på eventet"


def test_an_area_without_code_says_event(client, people):
    response = client.post("/events/", json=payload(scope="lan"))
    assert "Välj område för eventet" in str(response.json())


def test_a_host_must_be_attending_and_only_the_creator_chooses(client, db, people):
    event = add_event(db, CREATOR, visibility=EventVisibility.open)
    response = client.put(f"/events/{event.id}/hosts/{GUEST}")
    assert response.status_code == 409
    login(people, GUEST)
    answer(client, event.id, "yes")
    assert client.put(f"/events/{event.id}/hosts/{GUEST}").status_code == 403


def test_a_host_handles_applications(client, db, people, applied):
    db.add(EventHost(event_id=applied.id, user_id=HOST))
    db.commit()
    client.put(f"/events/{applied.id}/requests/me", json={})
    login(people, HOST)
    assert client.put(f"/events/{applied.id}/requests/{GUEST}").status_code == 204


def test_removing_a_host(client, db, people):
    event = add_event(db, CREATOR, visibility=EventVisibility.open)
    db.add(EventHost(event_id=event.id, user_id=HOST))
    db.commit()
    assert client.delete(f"/events/{event.id}/hosts/{HOST}").status_code == 204
    assert db.query(EventHost).count() == 0
