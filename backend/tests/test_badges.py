"""GET /users/me/badges: siffrorna för appens märken i ett anrop, med samma regler som listorna de räknar
(Personer, Klubbar, Events och Brev). Och att konversationslistan inte gör fler frågor ju fler konversationer
man har."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event

from app.models.contact import Contact
from app.models.event import Event, EventAnswer, EventInvitation, EventResponse, EventVisibility
from app.models.group import Group, GroupMember, GroupRole, GroupVisibility, GroupInvitation
from app.models.interest import Interest
from app.models.message import Message
from app.models.user import User

URL = "/users/me/badges"
SOON = datetime.now(timezone.utc) + timedelta(days=3)


def _pair(a, b):
    return f"{min(a, b)}:{max(a, b)}"


@pytest.fixture
def people(db, user):
    others = [User(id=n, username=f"anv{n}", password_hash="unused") for n in range(2, 7)]
    db.add_all(others)
    db.commit()
    return others


@pytest.fixture
def interest(db):
    item = Interest(name="Schack", slug="schack")
    db.add(item)
    db.commit()
    return item


def _group(db, owner_id, interest_id, name):
    group = Group(name=name, description="En klubb", interest_id=interest_id, municipality_code="1480",
                  visibility=GroupVisibility.public, created_by=owner_id)
    db.add(group)
    db.flush()
    db.add(GroupMember(group_id=group.id, user_id=owner_id, role=GroupRole.owner))
    return group


def _event(db, creator_id, interest_id, title, starts_at=SOON):
    item = Event(title=title, description="Vi ses", interest_id=interest_id, starts_at=starts_at, place_name="Parken",
                 address="Gatan 1", visibility=EventVisibility.invite_only, created_by=creator_id)
    db.add(item)
    db.flush()
    return item


def test_no_badges_for_a_new_user(client, user):
    response = client.get(URL)
    assert response.status_code == 200
    assert response.json() == {
        "contact_requests": 0,
        "club_invitations": 0,
        "event_invitations": 0,
        "conversations": [],
        "club_events": [],
    }


def test_only_incoming_pending_requests_count(client, db, user, people):
    db.add_all([
        Contact(requester_id=2, addressee_id=1, pair_key=_pair(1, 2), status="PENDING"),  # till mig: räknas
        Contact(requester_id=3, addressee_id=1, pair_key=_pair(1, 3), status="PENDING"),  # till mig: räknas
        Contact(requester_id=1, addressee_id=4, pair_key=_pair(1, 4), status="PENDING"),  # från mig
        Contact(requester_id=5, addressee_id=1, pair_key=_pair(1, 5), status="ACCEPTED"),  # redan kontakt
        Contact(requester_id=6, addressee_id=1, pair_key=_pair(1, 6), status="BLOCKED"),
    ])
    db.commit()
    assert client.get(URL).json()["contact_requests"] == 2
    assert client.get(URL).json()["contact_requests"] == len(client.get("/contacts").json()["incoming_requests"])


def test_club_invitations_skip_clubs_i_am_already_in(client, db, user, people, interest, municipalities):
    invited = _group(db, 2, interest.id, "Inbjuden")
    joined = _group(db, 3, interest.id, "Redan med")
    db.add_all([
        GroupInvitation(group_id=invited.id, user_id=1, invited_by=2),
        GroupInvitation(group_id=joined.id, user_id=1, invited_by=3),
        GroupMember(group_id=joined.id, user_id=1, role=GroupRole.member),
    ])
    db.commit()
    assert client.get(URL).json()["club_invitations"] == 1
    assert client.get("/groups/invitations/count").json() == {"count": 1}
    assert len(client.get("/groups/invitations").json()) == 1


def test_event_invitations_count_only_unanswered_upcoming_ones(client, db, user, people, interest):
    unanswered = _event(db, 2, interest.id, "Obesvarad")
    answered = _event(db, 2, interest.id, "Besvarad")
    past = _event(db, 2, interest.id, "Passerad", starts_at=datetime.now(timezone.utc) - timedelta(days=3))
    _event(db, 2, interest.id, "Inte inbjuden")
    db.add_all([
        EventInvitation(event_id=unanswered.id, user_id=1),
        EventInvitation(event_id=answered.id, user_id=1),
        EventInvitation(event_id=past.id, user_id=1),
        EventResponse(event_id=answered.id, user_id=1, answer=EventAnswer.yes),
    ])
    db.commit()
    assert client.get(URL).json()["event_invitations"] == 1
    events = client.get("/events/").json()
    assert client.get(URL).json()["event_invitations"] == sum(1 for e in events if e["is_invited"] and e["my_answer"] is None)


def test_club_events_are_the_unanswered_upcoming_ones_in_my_clubs(client, db, user, people, interest, municipalities):
    mine = _group(db, 2, interest.id, "Min klubb")
    other = _group(db, 3, interest.id, "Inte min")
    db.add(GroupMember(group_id=mine.id, user_id=1, role=GroupRole.member))
    new = _event(db, 2, interest.id, "Nytt")
    answered = _event(db, 2, interest.id, "Besvarat")
    invited = _event(db, 2, interest.id, "Inbjuden")  # räknas redan som inbjudan
    own = _event(db, 1, interest.id, "Mitt eget")
    past = _event(db, 2, interest.id, "Passerat", starts_at=datetime.now(timezone.utc) - timedelta(days=3))
    elsewhere = _event(db, 3, interest.id, "Annan klubb")
    for item in (new, answered, invited, own, past):
        item.group_id = mine.id
    elsewhere.group_id = other.id
    db.add_all([
        EventResponse(event_id=answered.id, user_id=1, answer=EventAnswer.no),
        EventInvitation(event_id=invited.id, user_id=1),
    ])
    db.commit()
    club_events = client.get(URL).json()["club_events"]
    assert [e["id"] for e in club_events] == [new.id]
    assert club_events[0]["created_at"]


def test_club_events_from_blocked_people_are_left_out(client, db, user, people, interest, municipalities):
    club = _group(db, 2, interest.id, "Min klubb")
    db.add(GroupMember(group_id=club.id, user_id=1, role=GroupRole.member))
    blocked = _event(db, 2, interest.id, "Från blockerad")
    blocked.group_id = club.id
    db.add(Contact(requester_id=1, addressee_id=2, pair_key=_pair(1, 2), status="BLOCKED"))
    db.commit()
    assert client.get(URL).json()["club_events"] == []


def test_conversations_give_the_latest_message_per_person(client, db, user, people):
    db.add_all([
        Message(sender_id=2, recipient_id=1, text="hej", created_at=datetime(2026, 1, 1, 10, tzinfo=timezone.utc)),
        Message(sender_id=1, recipient_id=2, text="hej själv", created_at=datetime(2026, 1, 1, 11, tzinfo=timezone.utc)),
        Message(sender_id=3, recipient_id=1, text="tjena", created_at=datetime(2026, 1, 2, 9, tzinfo=timezone.utc)),
    ])
    db.commit()
    conversations = client.get(URL).json()["conversations"]
    # Nyast först, och vem som skrev det senaste brevet.
    assert [(c["id"], c["last_message_from_me"]) for c in conversations] == [(3, False), (2, True)]
    # Samma konversationer, i samma ordning, som på Brev.
    assert [c["id"] for c in client.get("/messages").json()] == [3, 2]


def test_conversations_with_blocked_people_are_left_out(client, db, user, people):
    db.add_all([
        Message(sender_id=2, recipient_id=1, text="hej"),
        Message(sender_id=3, recipient_id=1, text="hej"),
        Contact(requester_id=3, addressee_id=1, pair_key=_pair(1, 3), status="BLOCKED"),
    ])
    db.commit()
    assert [c["id"] for c in client.get(URL).json()["conversations"]] == [2]
    assert [c["id"] for c in client.get("/messages").json()] == [2]


def test_badges_need_a_finished_profile(client, user, profile_lock):
    assert client.get(URL).status_code == 403


# ---------- Antalet databasfrågor ----------
# Varje fråga till Neon tar tid, så listorna som hämtas ofta får inte göra en fråga per rad.


def _count_queries(db, call):
    queries = []
    listener = lambda *args, **kwargs: queries.append(1)  # noqa: E731
    event.listen(db.get_bind(), "before_cursor_execute", listener)
    try:
        call()
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", listener)
    return len(queries)


@pytest.mark.parametrize("url", ["/messages", URL])
def test_the_number_of_queries_does_not_grow_with_the_number_of_conversations(client, db, user, people, url):
    db.add(Message(sender_id=2, recipient_id=1, text="hej"))
    db.commit()
    with_one = _count_queries(db, lambda: client.get(url))
    for other in people[1:]:
        db.add_all([Message(sender_id=other.id, recipient_id=1, text="hej"), Message(sender_id=1, recipient_id=other.id, text="svar")])
    db.commit()
    with_five = _count_queries(db, lambda: client.get(url))
    assert with_five == with_one
