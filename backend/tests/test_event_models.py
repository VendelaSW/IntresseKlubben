"""Databasreglerna för events (modellerna). Själva API:et kommer i senare steg."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Event, EventInvitation, EventResponse, Interest, User
from app.models.event import EventAnswer, EventVisibility

START = datetime(2030, 5, 1, 18, 0, tzinfo=timezone.utc)


@pytest.fixture
def interest(db):
    row = Interest(id=1, name="Löpning")
    db.add(row)
    db.commit()
    return row


def make_event(creator_id, interest_id, **overrides):
    values = dict(
        title="Morgonlöpning",
        description="Vi springer 5 km.",
        interest_id=interest_id,
        starts_at=START,
        place_name="Slottsskogen",
        address="Slottsskogsvallen 1",
        created_by=creator_id,
    )
    values.update(overrides)
    return Event(**values)


def test_event_defaults_to_invite_only_and_optional_fields_are_empty(db, user, interest):
    event = make_event(user.id, interest.id)
    db.add(event)
    db.commit()
    assert event.visibility == EventVisibility.invite_only
    assert event.ends_at is None
    assert event.group_id is None


@pytest.mark.parametrize("missing", ["title", "description", "starts_at", "place_name", "address"])
def test_required_event_fields_cannot_be_null(db, user, interest, missing):
    db.add(make_event(user.id, interest.id, **{missing: None}))
    with pytest.raises(IntegrityError):
        db.commit()


def test_event_must_have_an_interest(db, user):
    db.add(make_event(user.id, None))
    with pytest.raises(IntegrityError):
        db.commit()


def test_event_cannot_end_before_it_starts(db, user, interest):
    db.add(make_event(user.id, interest.id, ends_at=START - timedelta(hours=1)))
    with pytest.raises(IntegrityError):
        db.commit()


def test_one_invitation_and_one_response_per_person_and_event(db, user, interest):
    other = User(id=2, username="other", password_hash="unused")
    event = make_event(user.id, interest.id)
    db.add_all([other, event])
    db.commit()

    db.add(EventInvitation(event_id=event.id, user_id=other.id))
    db.commit()
    db.add(EventInvitation(event_id=event.id, user_id=other.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    db.add(EventResponse(event_id=event.id, user_id=other.id, answer=EventAnswer.maybe))
    db.commit()
    db.add(EventResponse(event_id=event.id, user_id=other.id, answer=EventAnswer.yes))
    with pytest.raises(IntegrityError):
        db.commit()


def test_deleting_an_event_removes_its_invitations_and_responses(db, user, interest):
    event = make_event(user.id, interest.id)
    db.add(event)
    db.commit()
    db.add_all([
        EventInvitation(event_id=event.id, user_id=user.id),
        EventResponse(event_id=event.id, user_id=user.id, answer=EventAnswer.yes),
    ])
    db.commit()

    db.delete(event)
    db.commit()
    assert db.query(EventInvitation).count() == 0
    assert db.query(EventResponse).count() == 0
