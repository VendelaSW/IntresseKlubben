from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.crud.contact import blocked_user_ids
from app.models.event import Event, EventInvitation, EventVisibility
from app.models.group import GroupMember
from app.schemas.event import EventCreate

# Ett event utan sluttid räknas som passerat så här länge efter starttiden.
OPEN_ENDED_EVENT_LENGTH = timedelta(hours=24)


def create_event(db: Session, user_id: int, data: EventCreate) -> Event:
    event = Event(
        title=data.title,
        description=data.description,
        interest_id=data.interest_id,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        place_name=data.place_name,
        address=data.address,
        visibility=data.visibility,
        created_by=user_id,
        group_id=data.group_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_visible_events(db: Session, user_id: int, now: datetime | None = None) -> list[Event]:
    """Kommande events som användaren får se, tidigast först.

    Ett event syns om det är öppet, om användaren har skapat det eller är
    inbjuden, eller om användaren är medlem i eventets klubb. Events av den
    som har blockerat användaren, eller som användaren har blockerat, syns
    inte. Passerade events döljs: de ligger kvar i databasen men visas inte.
    """
    now = now or datetime.now(timezone.utc)
    invited = db.query(EventInvitation.event_id).filter(EventInvitation.user_id == user_id)
    my_groups = db.query(GroupMember.group_id).filter(GroupMember.user_id == user_id)
    not_over = or_(
        and_(Event.ends_at.isnot(None), Event.ends_at >= now),
        and_(Event.ends_at.is_(None), Event.starts_at >= now - OPEN_ENDED_EVENT_LENGTH),
    )
    return (
        db.query(Event)
        .options(
            selectinload(Event.interest),
            selectinload(Event.group),
            selectinload(Event.creator),
        )
        .filter(
            or_(
                Event.visibility == EventVisibility.open,
                Event.created_by == user_id,
                Event.id.in_(invited),
                Event.group_id.in_(my_groups),
            ),
            not_over,
            Event.created_by.notin_(blocked_user_ids(db, user_id)),
        )
        .order_by(Event.starts_at, Event.id)
        .all()
    )
