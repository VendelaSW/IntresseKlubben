"""Hjälpmedel som delas av eventtesterna."""

from datetime import datetime, timedelta, timezone

from app.models import Contact, Event, Group, GroupMember
from app.models.group import GroupRole, GroupVisibility


def future(days=7, hours=0):
    return datetime.now(timezone.utc) + timedelta(days=days, hours=hours)


def payload(**overrides):
    values = {
        "title": "Morgonlöpning",
        "description": "Vi springer 5 km.",
        "interest_id": 1,
        "starts_at": future().isoformat(),
        "place_name": "Slottsskogen",
        "address": "Slottsskogsvallen 1",
    }
    values.update(overrides)
    return values


def add_event(db, creator_id, **overrides):
    values = dict(
        title="Event",
        description="Beskrivning",
        interest_id=1,
        starts_at=future(),
        place_name="Plats",
        address="Gatan 1",
        created_by=creator_id,
    )
    values.update(overrides)
    event = Event(**values)
    db.add(event)
    db.commit()
    return event


def add_group(db, owner_id, visibility=GroupVisibility.public, members=(), name="Löparna"):
    group = Group(
        name=name,
        description="Springer",
        interest_id=1,
        municipality_code="1480",
        visibility=visibility,
        created_by=owner_id,
    )
    group.members.append(GroupMember(user_id=owner_id, role=GroupRole.owner))
    for member_id in members:
        group.members.append(GroupMember(user_id=member_id))
    db.add(group)
    db.commit()
    return group


def add_contact(db, first_id, second_id, status="ACCEPTED"):
    """En kontakt (eller blockering) mellan två användare."""
    db.add(
        Contact(
            requester_id=first_id,
            addressee_id=second_id,
            pair_key=f"{min(first_id, second_id)}:{max(first_id, second_id)}",
            status=status,
        )
    )
    db.commit()
