from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.core import error_messages as msg
from app.crud.contact import accepted_contact_ids, blocked_by_me_ids, blocked_user_ids
from app.crud.group import get_group, get_membership
from app.crud.user import get_user_by_username
from app.models.contact import Contact
from app.models.event import Event, EventAnswer, EventInvitation, EventResponse, EventVisibility
from app.models.group import Group, GroupMember, GroupVisibility
from app.models.user import User
from app.schemas.event import EventCreate, EventUpdate

# Ett event utan sluttid räknas som passerat så här länge efter starttiden.
OPEN_ENDED_EVENT_LENGTH = timedelta(hours=24)


class EventRuleError(Exception):
    """En regel för events bröts. Statuskoden och texten visas för användaren."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def _event_query(db: Session):
    return db.query(Event).options(
        selectinload(Event.interest),
        selectinload(Event.group),
        selectinload(Event.creator),
        selectinload(Event.invitations),
        selectinload(Event.responses),
    )


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
        guests_can_invite=data.guests_can_invite,
        created_by=user_id,
        group_id=data.group_id,
    )
    db.add(event)
    db.commit()
    return get_event(db, event.id)


def _as_utc(value: datetime) -> datetime:
    # Vissa databaser (SQLite i testerna) ger tillbaka tid utan tidszon.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def update_event(db: Session, event: Event, data: EventUpdate) -> Event:
    changes = data.model_dump(exclude_unset=True)
    starts_at = _as_utc(changes.get("starts_at", event.starts_at))
    ends_at = changes.get("ends_at", event.ends_at)
    if ends_at is not None and _as_utc(ends_at) <= starts_at:
        raise EventRuleError(422, msg.EVENT_END_BEFORE_START)
    for field, value in changes.items():
        setattr(event, field, value)
    db.commit()
    return get_event(db, event.id)


def delete_event(db: Session, event: Event) -> None:
    """Tar bort eventet och dess inbjudningar och svar."""
    db.delete(event)
    db.commit()


def can_invite(event: Event, user_id: int) -> bool:
    """Skaparen får alltid bjuda in, andra bara om skaparen har slagit på det.
    Att användaren kan se eventet kontrolleras av den som anropar."""
    return event.created_by == user_id or event.guests_can_invite


def get_event(db: Session, event_id: int) -> Event | None:
    return _event_query(db).filter(Event.id == event_id).first()


def _can_see(db: Session, user_id: int):
    """Villkoret för vilka events användaren får se (utan tidsgräns)."""
    invited = db.query(EventInvitation.event_id).filter(EventInvitation.user_id == user_id)
    my_groups = db.query(GroupMember.group_id).filter(GroupMember.user_id == user_id)
    return and_(
        or_(
            Event.visibility == EventVisibility.open,
            Event.created_by == user_id,
            Event.id.in_(invited),
            Event.group_id.in_(my_groups),
        ),
        Event.created_by.notin_(blocked_user_ids(db, user_id)),
    )


def get_visible_event(db: Session, event_id: int, user_id: int) -> Event | None:
    """Eventet, om användaren får se det (passerade events ingår). Annars None,
    så att ett dolt event ger samma svar som ett som inte finns."""
    return _event_query(db).filter(Event.id == event_id, _can_see(db, user_id)).first()


def list_visible_events(
    db: Session, user_id: int, now: datetime | None = None, group_id: int | None = None
) -> list[Event]:
    """Kommande events som användaren får se, tidigast först.

    Ett event syns om det är öppet, om användaren har skapat det eller är
    inbjuden, eller om användaren är medlem i eventets klubb. Events av den
    som har blockerat användaren, eller som användaren har blockerat, syns
    inte. Passerade events döljs: de ligger kvar i databasen men visas inte.
    Med group_id visas bara den klubbens events, men synlighetsreglerna är desamma.
    """
    now = now or datetime.now(timezone.utc)
    not_over = or_(
        and_(Event.ends_at.isnot(None), Event.ends_at >= now),
        and_(Event.ends_at.is_(None), Event.starts_at >= now - OPEN_ENDED_EVENT_LENGTH),
    )
    query = _event_query(db).filter(_can_see(db, user_id), not_over)
    if group_id is not None:
        query = query.filter(Event.group_id == group_id)
    return query.order_by(Event.starts_at, Event.id).all()


# ---------- Klubbar ----------


def get_group_for_member(db: Session, group_id: int, user_id: int) -> Group:
    """Klubben, om användaren är med i den.

    En privat klubb ska inte avslöjas för den som inte är med, så den ger samma
    svar som en klubb som inte finns.
    """
    group = get_group(db, group_id)
    membership = get_membership(group, user_id) if group else None
    if group is None or (group.visibility == GroupVisibility.private and membership is None):
        raise EventRuleError(404, msg.GROUP_NOT_FOUND)
    if membership is None:
        raise EventRuleError(403, msg.MUST_BE_GROUP_MEMBER)
    return group


# ---------- Inbjudningar ----------


def invite(
    db: Session, event: Event, inviter_id: int, usernames: list[str], group_ids: list[int]
) -> list[User]:
    """Bjuder in kontakter till inviter_id (efter användarnamn) och/eller alla
    nuvarande medlemmar i klubbar som inviter_id är med i. Vem som helst som kan
    se eventet får bjuda in, och det är den som bjuder in som kontakterna och
    klubbarna räknas från. Antingen går alla inbjudningar igenom eller ingen.
    Skaparen, den som bjuder in, redan inbjudna och de som har en blockering
    med skaparen hoppas över.
    Returnerar de som blev inbjudna den här gången (profil förladdad)."""
    target_ids: set[int] = set()

    contact_ids = accepted_contact_ids(db, inviter_id)
    for username in usernames:
        user = get_user_by_username(db, username)
        # Samma svar för en okänd användare och en som inte är en kontakt.
        if user is None or user.id not in contact_ids:
            raise EventRuleError(422, msg.CAN_ONLY_INVITE_CONTACTS)
        target_ids.add(user.id)

    hidden = blocked_user_ids(db, inviter_id)
    for group_id in group_ids:
        group = get_group_for_member(db, group_id, inviter_id)
        # Medlemmarna just nu. Den som går med senare ser eventet via klubben.
        target_ids.update(m.user_id for m in group.members if m.user_id not in hidden)

    target_ids.discard(inviter_id)
    target_ids.discard(event.created_by)
    # Den som har blockerat skaparen, eller som skaparen har blockerat, bjuds inte
    # in heller, även om en gäst har dem som kontakt. De hoppas över tyst: ett fel
    # skulle avslöja för gästen att skaparen har en blockering.
    target_ids -= blocked_user_ids(db, event.created_by)
    target_ids -= {i.user_id for i in event.invitations}
    db.add_all(EventInvitation(event_id=event.id, user_id=user_id) for user_id in target_ids)
    db.commit()
    return list(
        db.query(User)
        .options(selectinload(User.profile))
        .filter(User.id.in_(target_ids))
        .order_by(User.id)
        .all()
    )


def list_invitees(db: Session, event: Event, viewer_id: int) -> list[User]:
    """De inbjudna (profil förladdad), äldsta inbjudan först. Den som har
    blockerat tittaren, eller som tittaren har blockerat, visas inte."""
    db.refresh(event)
    hidden = blocked_user_ids(db, viewer_id)
    user_ids = [i.user_id for i in sorted(event.invitations, key=lambda i: i.id) if i.user_id not in hidden]
    users = {
        u.id: u
        for u in db.query(User).options(selectinload(User.profile)).filter(User.id.in_(user_ids)).all()
    }
    return [users[user_id] for user_id in user_ids if user_id in users]


def remove_invitation(db: Session, event: Event, username: str) -> None:
    user = get_user_by_username(db, username)
    invitation = (
        db.query(EventInvitation)
        .filter(EventInvitation.event_id == event.id, EventInvitation.user_id == (user.id if user else None))
        .first()
    )
    if invitation is None:
        raise EventRuleError(404, msg.PERSON_NOT_INVITED)
    db.delete(invitation)
    db.commit()


# ---------- Svar ----------


def set_answer(db: Session, event: Event, user_id: int, answer: EventAnswer) -> None:
    """Sparar användarens svar. Svarar hen igen byts det tidigare svaret ut."""
    response = (
        db.query(EventResponse)
        .filter(EventResponse.event_id == event.id, EventResponse.user_id == user_id)
        .first()
    )
    if response is None:
        db.add(EventResponse(event_id=event.id, user_id=user_id, answer=answer))
    else:
        response.answer = answer
    db.commit()


def list_responses(db: Session, event: Event, viewer_id: int) -> list[tuple[EventResponse, User, bool]]:
    """Alla som har svarat (profil förladdad), den som svarade först överst.
    Varje rad har också en flagga: True om tittaren själv har blockerat
    personen. De syns då med en varning, så att man inte går på ett event utan
    att veta att någon man har blockerat kommer. Den som har blockerat tittaren
    döljs helt och utan varning, annars skulle tittaren förstå att hen är
    blockerad."""
    blocked_by_me = blocked_by_me_ids(db, viewer_id)
    hidden = blocked_user_ids(db, viewer_id) - blocked_by_me
    rows = (
        db.query(EventResponse)
        .filter(EventResponse.event_id == event.id, EventResponse.user_id.notin_(hidden))
        .order_by(EventResponse.id)
        .all()
    )
    users = {
        u.id: u
        for u in db.query(User)
        .options(selectinload(User.profile))
        .filter(User.id.in_([r.user_id for r in rows]))
        .all()
    }
    return [(r, users[r.user_id], r.user_id in blocked_by_me) for r in rows if r.user_id in users]
