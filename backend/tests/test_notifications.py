"""Tester för notiser från Intresseklubben: när ett event ställs in eller får ny tid eller plats får de som har
svarat Ja eller Kanske en notis (GET /notifications), och olästa räknas i märket."""

import pytest

from app.auth.security import get_current_user
from app.main import app
from app.models import EventResponse, Interest, User
from app.models.event import EventAnswer
from app.models.notification import Notification
from tests.event_helpers import add_contact, add_event, future


@pytest.fixture(autouse=True)
def interests(db):
    db.add(Interest(id=1, name="Fotboll"))
    db.commit()


@pytest.fixture
def people(db, user):
    """user (id 1) skapar eventet. 2 svarar Ja, 3 Kanske, 4 Nej och 5 har inte svarat."""
    rows = [User(id=n, username=f"person{n}", password_hash="unused") for n in (2, 3, 4, 5)]
    db.add_all(rows)
    db.commit()
    return {row.id: row for row in rows}


@pytest.fixture
def event(db, user, people):
    event = add_event(db, user.id, title="Fotbollsträffen", starts_at=future(days=5), place_name="Slottsskogen")
    db.add_all(
        [
            EventResponse(event_id=event.id, user_id=2, answer=EventAnswer.yes),
            EventResponse(event_id=event.id, user_id=3, answer=EventAnswer.maybe),
            EventResponse(event_id=event.id, user_id=4, answer=EventAnswer.no),
            # Skaparen har svarat Ja på sitt eget event, men ska inte få någon notis.
            EventResponse(event_id=event.id, user_id=1, answer=EventAnswer.yes),
        ]
    )
    db.commit()
    return event


def login_as(person):
    app.dependency_overrides[get_current_user] = lambda: person


def recipients(db):
    return sorted(n.user_id for n in db.query(Notification).all())


# ---------- Inställt ----------


def test_cancelling_notifies_those_who_said_yes_or_maybe(client, db, event):
    assert client.request("DELETE", f"/events/{event.id}").status_code == 204
    assert recipients(db) == [2, 3]


def test_the_notification_says_which_event_and_carries_the_message(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}", json={"message": "  Inställt pga sjukdom  "})

    login_as(people[2])
    [notice] = client.get("/notifications").json()
    assert notice["kind"] == "event_cancelled"
    assert notice["title"] == "«Fotbollsträffen» har ställts in"
    assert notice["body"] == "testuser har tagit bort eventet som du skulle gå på."
    assert notice["quote"] == "Inställt pga sjukdom"
    assert notice["quote_by"] == "testuser"
    assert notice["link"] is None  # eventet finns inte kvar
    assert notice["read"] is False


def test_the_message_is_optional(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}", json={"message": "   "})
    login_as(people[2])
    notice = client.get("/notifications").json()[0]
    assert notice["quote"] is None
    assert notice["quote_by"] is None


def test_the_message_goes_through_the_profanity_filter(client, db, event, people):
    from app.core.profanity import censor_text

    text = "Inställt, fan också"
    client.request("DELETE", f"/events/{event.id}", json={"message": text})
    login_as(people[2])
    assert client.get("/notifications").json()[0]["quote"] == censor_text(text)


def test_a_too_long_message_is_rejected_and_nothing_is_deleted(client, db, event):
    response = client.request("DELETE", f"/events/{event.id}", json={"message": "x" * 301})
    assert response.status_code == 422
    assert db.query(Notification).count() == 0
    assert client.get("/events/").json()[0]["id"] == event.id


def test_someone_blocked_by_the_creator_gets_no_notification(client, db, event):
    add_contact(db, 1, 2, status="BLOCKED")
    client.request("DELETE", f"/events/{event.id}")
    assert recipients(db) == [3]


def test_only_the_creator_can_cancel(client, db, event, people):
    login_as(people[2])
    assert client.request("DELETE", f"/events/{event.id}", json={"message": "Hej"}).status_code in (403, 404)
    assert db.query(Notification).count() == 0


# ---------- Ändrat ----------


def test_a_new_time_notifies_the_attendees(client, db, event, people):
    response = client.patch(f"/events/{event.id}", json={"starts_at": future(days=6).isoformat()})
    assert response.status_code == 200
    assert recipients(db) == [2, 3]

    login_as(people[3])
    [notice] = client.get("/notifications").json()
    assert notice["kind"] == "event_changed"
    assert notice["title"] == "«Fotbollsträffen» har fått ny tid"
    assert notice["link"] == f"/events?event={event.id}"


def test_a_new_place_notifies_the_attendees(client, db, event, people):
    client.patch(f"/events/{event.id}", json={"latitude": 57.69, "longitude": 11.97})
    login_as(people[2])
    assert client.get("/notifications").json()[0]["title"] == "«Fotbollsträffen» har fått ny plats"


def test_new_time_and_place_give_one_notification_each(client, db, event, people):
    client.patch(f"/events/{event.id}", json={"starts_at": future(days=6).isoformat(), "place_name": "Ullevi"})
    assert recipients(db) == [2, 3]
    login_as(people[2])
    assert client.get("/notifications").json()[0]["title"] == "«Fotbollsträffen» har fått ny tid och plats"


def test_other_changes_give_no_notification(client, db, event):
    client.patch(f"/events/{event.id}", json={"title": "Fotboll i parken", "description": "Ta med vatten."})
    assert db.query(Notification).count() == 0


def test_sending_the_same_time_again_gives_no_notification(client, db, event):
    client.patch(f"/events/{event.id}", json={"place_name": event.place_name})
    assert db.query(Notification).count() == 0


# ---------- Läsa ----------


def test_unread_notifications_are_counted_in_the_badges(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}")

    login_as(people[2])
    assert client.get("/users/me/badges").json()["unread_notifications"] == 1
    assert client.post("/notifications/read").status_code == 204
    assert client.get("/users/me/badges").json()["unread_notifications"] == 0
    assert client.get("/notifications").json()[0]["read"] is True


def test_the_badge_only_counts_notifications_shown_in_the_list(client, db, people, monkeypatch):
    # Listan visar de LIST_LIMIT senaste. En oläst notis längre ner syns inte, och ska då inte räknas i märket.
    from app.crud import notification as crud
    from app.models.notification import NotificationKind

    monkeypatch.setattr(crud, "LIST_LIMIT", 2)
    for title in ("Äldst", "Mitten", "Nyast"):
        crud.notify(db, [2], NotificationKind.event_changed, title=title)
        db.commit()

    login_as(people[2])
    assert [n["title"] for n in client.get("/notifications").json()] == ["Nyast", "Mitten"]
    assert client.get("/users/me/badges").json()["unread_notifications"] == 2


def test_you_only_see_your_own_notifications(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}")
    login_as(people[4])
    assert client.get("/notifications").json() == []


def test_newest_first(client, db, user, people, event):
    second = add_event(db, user.id, title="Schackkvällen", starts_at=future(days=8))
    db.add(EventResponse(event_id=second.id, user_id=2, answer=EventAnswer.yes))
    db.commit()
    client.request("DELETE", f"/events/{event.id}")
    client.request("DELETE", f"/events/{second.id}")

    login_as(people[2])
    titles = [n["title"] for n in client.get("/notifications").json()]
    assert titles == ["«Schackkvällen» har ställts in", "«Fotbollsträffen» har ställts in"]


def test_deleting_an_account_removes_its_notifications(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}")
    from app.crud.user import delete_user

    delete_user(db, db.get(User, 2))
    assert recipients(db) == [3]


# ---------- Ta bort ----------


def test_you_can_remove_a_notification(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}")
    login_as(people[2])
    [notice] = client.get("/notifications").json()

    assert client.delete(f"/notifications/{notice['id']}").status_code == 204
    assert client.get("/notifications").json() == []


def test_you_cannot_remove_someone_elses_notification(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}")
    login_as(people[2])
    [notice] = client.get("/notifications").json()

    login_as(people[3])
    assert client.delete(f"/notifications/{notice['id']}").status_code == 404
    login_as(people[2])
    assert len(client.get("/notifications").json()) == 1


def test_you_can_remove_all_your_notifications(client, db, user, people, event):
    second = add_event(db, user.id, title="Schackkvällen", starts_at=future(days=8))
    db.add(EventResponse(event_id=second.id, user_id=2, answer=EventAnswer.yes))
    db.commit()
    client.request("DELETE", f"/events/{event.id}")
    client.request("DELETE", f"/events/{second.id}")

    login_as(people[2])
    assert client.delete("/notifications").status_code == 204
    assert client.get("/notifications").json() == []
    # Bara ens egna: person 3 har kvar sin.
    assert recipients(db) == [3]


# ---------- Allmänt ----------


def test_notify_can_send_any_kind_of_notice(client, db, people):
    # notify() är det allmänna sättet att skicka en notis, för fler sorter i framtiden.
    from app.crud.notification import notify
    from app.models.notification import NotificationKind

    notify(db, [2, 2, 3], NotificationKind.event_changed, title="Rubrik", body="Text", link="/klubbar?klubb=1")
    db.commit()

    assert recipients(db) == [2, 3]  # en per person, även om någon står med två gånger
    login_as(people[2])
    notice = client.get("/notifications").json()[0]
    assert (notice["title"], notice["body"], notice["link"]) == ("Rubrik", "Text", "/klubbar?klubb=1")


# ---------- Läsa en i taget ----------


def test_opening_a_notification_marks_only_that_one_read(client, db, user, people, event):
    second = add_event(db, user.id, title="Schackkvällen", starts_at=future(days=8))
    db.add(EventResponse(event_id=second.id, user_id=2, answer=EventAnswer.yes))
    db.commit()
    client.request("DELETE", f"/events/{event.id}")
    client.request("DELETE", f"/events/{second.id}")

    login_as(people[2])
    newest, older = client.get("/notifications").json()
    assert client.get("/users/me/badges").json()["unread_notifications"] == 2

    assert client.post(f"/notifications/{newest['id']}/read").status_code == 204
    assert client.post(f"/notifications/{newest['id']}/read").status_code == 204  # går att upprepa

    after = {n["id"]: n["read"] for n in client.get("/notifications").json()}
    assert after == {newest["id"]: True, older["id"]: False}
    assert client.get("/users/me/badges").json()["unread_notifications"] == 1


def test_you_cannot_mark_someone_elses_notification_read(client, db, event, people):
    client.request("DELETE", f"/events/{event.id}")
    login_as(people[2])
    [notice] = client.get("/notifications").json()

    login_as(people[3])
    assert client.post(f"/notifications/{notice['id']}/read").status_code == 404
    login_as(people[2])
    assert client.get("/notifications").json()[0]["read"] is False
