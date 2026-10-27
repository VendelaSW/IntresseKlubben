from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_profile
from app.core import error_messages as msg
from app.core import storage
from app.core.profanity import censor_text
from app.crud.event import (
    EventRuleError,
    apply_to_event,
    approve_event_request,
    can_answer,
    can_invite,
    create_event,
    decline_event_request,
    delete_event,
    get_group_for_member,
    get_visible_event,
    has_applied,
    invite,
    is_full,
    is_host,
    list_event_requests,
    list_invitees,
    list_responses,
    list_visible_events,
    remove_invitation,
    request_count,
    set_answer,
    set_host,
    update_event,
    withdraw_event_request,
    yes_count,
)
from app.crud.group import get_membership, is_invited
from app.crud.interest import get_active_interest
from app.crud.notification import notify_event_cancelled, notify_event_changed
from app.db.session import get_db
from app.models.event import Event, EventVisibility
from app.models.group import GroupScope, GroupVisibility
from app.models.user import User
from app.schemas.contact import ContactUser
from app.schemas.event import (
    EventAnswerIn,
    EventAttendee,
    EventCreate,
    EventInvite,
    EventOut,
    EventUpdate,
)
from app.schemas.group import GroupJoinRequestCreate, GroupJoinRequestOut
from app.schemas.notification import EventCancel
from app.services.regions import area_name, is_known_area

from app.services.text_moderation import check_fields

# Låst tills profilen är klar (se require_profile).
router = APIRouter(prefix="/events", tags=["events"], dependencies=[Depends(require_profile)])


def _group_visible(event: Event, user_id: int) -> bool:
    """Går klubben att öppna för användaren? En öppen klubb alltid, en privat bara för
    den som är med eller inbjuden (samma regel som GET /groups/{id})."""
    group = event.group
    if group is None:
        return False
    return (
        group.visibility != GroupVisibility.private
        or get_membership(group, user_id) is not None
        or is_invited(group, user_id)
    )


def _to_response(event: Event, user_id: int, db: Session | None = None) -> EventOut:
    # db behövs bara för värdarnas antal ansökningar (request_count), och bara om det finns några.
    creator = event.creator
    host = is_host(event, user_id)
    return EventOut(
        id=event.id,
        title=event.title,
        description=event.description,
        interest_id=event.interest_id,
        interest_name=event.interest.name,
        interest_area=event.interest.area,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        place_name=event.place_name,
        address=event.address,
        latitude=event.latitude,
        longitude=event.longitude,
        visibility=event.visibility,
        scope=event.scope,
        scope_code=event.scope_code,
        scope_name=area_name(event.scope, event.scope_code) if event.scope else None,
        skill_level=event.skill_level,
        max_attendees=event.max_attendees,
        yes_count=yes_count(event),
        is_full=is_full(event),
        group_id=event.group_id,
        group_name=event.group.name if event.group else None,
        group_visible=_group_visible(event, user_id),
        creator_id=creator.id,
        creator_username=creator.username,
        creator_name=creator.profile.name if creator.profile else None,
        is_owner=event.created_by == user_id,
        is_host=host,
        host_ids=[h.user_id for h in event.hosts],
        can_answer=can_answer(event, user_id),
        has_applied=has_applied(event, user_id),
        request_count=request_count(db, event, user_id) if host and db is not None else 0,
        can_invite=can_invite(event, user_id),
        guests_can_invite=event.guests_can_invite,
        is_invited=any(i.user_id == user_id for i in event.invitations),
        my_answer=next((r.answer for r in event.responses if r.user_id == user_id), None),
        created_at=event.created_at,
    )


def _to_invitee(user: User) -> ContactUser:
    profile = user.profile
    image_key = profile.profile_image_url if profile else None
    return ContactUser(
        id=user.id,
        username=user.username,
        name=profile.name if profile else None,
        image_url=storage.public_url(image_key) if image_key else None,
    )


def _visible_event_or_404(db: Session, event_id: int, user_id: int) -> Event:
    # Ett event man inte får se ger samma svar som ett som inte finns.
    event = get_visible_event(db, event_id, user_id)
    if event is None:
        raise HTTPException(status_code=404, detail=msg.EVENT_NOT_FOUND)
    return event


def _to_attendees(db: Session, event: Event, viewer_id: int) -> list[EventAttendee]:
    return [
        EventAttendee(**_to_invitee(user).model_dump(), answer=response.answer, blocked_by_me=blocked_by_me)
        for response, user, blocked_by_me in list_responses(db, event, viewer_id)
    ]


def _own_event_or_error(db: Session, event_id: int, user_id: int) -> Event:
    event = _visible_event_or_404(db, event_id, user_id)
    if event.created_by != user_id:
        raise HTTPException(status_code=403, detail=msg.EVENT_ONLY_CREATOR)
    return event


def _hosted_event_or_error(db: Session, event_id: int, user_id: int) -> Event:
    """Eventet, om användaren är dess skapare eller medarrangör (SCRUM-296). Annars 403."""
    event = _visible_event_or_404(db, event_id, user_id)
    if not is_host(event, user_id):
        raise HTTPException(status_code=403, detail=msg.EVENT_ONLY_HOSTS)
    return event


def _check_area(scope: GroupScope | None, scope_code: str | None) -> None:
    if scope is not None and not is_known_area(scope, scope_code):
        raise HTTPException(status_code=422, detail=msg.GROUP_UNKNOWN_AREA)


@router.post("/", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create(
    data: EventCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kolla här så att okända värden ger ett tydligt fel i stället för ett
    # databasfel (500) från de främmande nycklarna. Ett inaktivt intresse går inte
    # att välja och ger samma fel som ett okänt.
    if get_active_interest(db, data.interest_id) is None:
        raise HTTPException(status_code=422, detail=msg.UNKNOWN_INTEREST)
    if data.group_id is not None:
        try:
            group = get_group_for_member(db, data.group_id, current_user.id)
        except EventRuleError as err:
            raise HTTPException(status_code=err.status_code, detail=err.detail)
        # Privata klubbars events är alltid privata. Ett uttryckligt "open"
        # avvisas hellre än rättas tyst, så att felet syns direkt.
        if group.visibility == GroupVisibility.private and data.visibility == EventVisibility.open:
            raise HTTPException(status_code=422, detail=msg.EVENT_IN_PRIVATE_GROUP_CANNOT_BE_OPEN)
        if group.visibility == GroupVisibility.private and data.visibility == EventVisibility.application:
            raise HTTPException(status_code=422, detail=msg.EVENT_APPLICATION_IN_PRIVATE_GROUP)
    _check_area(data.scope, data.scope_code)
    check_fields(
        ai=True,
        ai_text=f"{data.title}\n{data.description}",
        title=data.title,
        description=data.description,
        place_name=data.place_name,
        address=data.address,
    )
    event = create_event(db, current_user.id, data)
    return _to_response(event, current_user.id)


@router.get("/", response_model=list[EventOut])
def read_events(
    group_id: int | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = list_visible_events(db, current_user.id, group_id=group_id)
    return [_to_response(e, current_user.id, db) for e in events]


@router.patch("/{event_id}", response_model=EventOut)
def edit_event(
    event_id: int,
    data: EventUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Skaparen och medarrangörerna får ändra (SCRUM-296).
    event = _hosted_event_or_error(db, event_id, current_user.id)
    if data.interest_id is not None and get_active_interest(db, data.interest_id) is None:
        raise HTTPException(status_code=422, detail=msg.UNKNOWN_INTEREST)
    if "scope" in data.model_fields_set:
        _check_area(data.scope, data.scope_code)
    changes = data.model_dump(exclude_unset=True)
    public_text = [changes[field] for field in ("title", "description") if field in changes]
    check_fields(
        ai=True,
        ai_text="\n".join(public_text),
        **{
            field: changes[field]
            for field in ("title", "description", "place_name", "address")
            if field in changes
        },
    )
    # Tid och plats före ändringen, för att se om deltagarna ska få en notis.
    time_before, place_before = _time_of(event), _place_of(event)
    try:
        event = update_event(db, event, data)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    notify_event_changed(db, event, _time_of(event) != time_before, _place_of(event) != place_before)
    return _to_response(event, current_user.id, db)


def _time_of(event: Event) -> tuple:
    return (event.starts_at, event.ends_at)


def _place_of(event: Event) -> tuple:
    return (event.place_name, event.address, event.latitude, event.longitude)


# Body är valfri: utan den (eller utan meddelande) får deltagarna bara beskedet att eventet är inställt.
@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_event(
    event_id: int,
    data: EventCancel | None = Body(default=None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _own_event_or_error(db, event_id, current_user.id)
    message = data.message if data else None
    notify_event_cancelled(db, event, censor_text(message) if message else None)
    delete_event(db, event)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{event_id}/invitations", response_model=list[ContactUser])
def read_invitations(
    event_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _hosted_event_or_error(db, event_id, current_user.id)
    return [_to_invitee(u) for u in list_invitees(db, event, current_user.id)]


# Skaparen får alltid bjuda in. Andra som kan se eventet får det bara om skaparen har
# slagit på "Gäster får bjuda in" (guests_can_invite). invite() räknar kontakter och
# klubbar från den som bjuder in. Svaret är de som blev inbjudna den här gången, inte
# hela listan (den ser bara skaparen).
@router.post("/{event_id}/invitations", response_model=list[ContactUser])
def add_invitations(
    event_id: int,
    data: EventInvite,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _visible_event_or_404(db, event_id, current_user.id)
    if not can_invite(event, current_user.id):
        raise HTTPException(status_code=403, detail=msg.EVENT_ONLY_CREATOR_CAN_INVITE)
    try:
        invited = invite(db, event, current_user.id, data.user_ids, data.group_ids)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return [_to_invitee(u) for u in invited]


@router.delete("/{event_id}/invitations/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invitation(
    event_id: int,
    user_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _hosted_event_or_error(db, event_id, current_user.id)
    try:
        remove_invitation(db, event, user_id)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Svaren är synliga för alla som kan se eventet: skaparen, de inbjudna och
# klubbens medlemmar för ett privat event, och alla för ett öppet.
@router.get("/{event_id}/responses", response_model=list[EventAttendee])
def read_responses(
    event_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _visible_event_or_404(db, event_id, current_user.id)
    return _to_attendees(db, event, current_user.id)


# PUT eftersom det går att upprepa: samma svar igen ger samma resultat, och ett
# nytt svar byter ut det gamla.
@router.put("/{event_id}/response", response_model=list[EventAttendee])
def answer_event(
    event_id: int,
    data: EventAnswerIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _visible_event_or_404(db, event_id, current_user.id)
    try:
        set_answer(db, event, current_user.id, data.answer)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return _to_attendees(db, event, current_user.id)


# ---------- Ansökningar (SCRUM-296) ----------


# Ansök till ett event man ansöker till, med ett valfritt meddelande. Skaparen och medarrangörerna får en notis.
@router.put("/{event_id}/requests/me", response_model=EventOut)
def apply(
    event_id: int,
    data: GroupJoinRequestCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _visible_event_or_404(db, event_id, current_user.id)
    if data.message:
        check_fields(labels={"message": "Meddelandet"}, message=data.message)
    try:
        apply_to_event(db, event, current_user, data.message)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return _to_response(get_visible_event(db, event.id, current_user.id), current_user.id, db)


@router.delete("/{event_id}/requests/me", response_model=EventOut)
def withdraw(event_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    event = _visible_event_or_404(db, event_id, current_user.id)
    withdraw_event_request(db, event, current_user.id)
    return _to_response(get_visible_event(db, event.id, current_user.id), current_user.id, db)


@router.get("/{event_id}/requests", response_model=list[GroupJoinRequestOut])
def read_requests(event_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    event = _hosted_event_or_error(db, event_id, current_user.id)
    return [
        GroupJoinRequestOut(user=_to_invitee(user), message=request.message, created_at=request.created_at)
        for request, user in list_event_requests(db, event, current_user.id)
    ]


# Godkänn (PUT: personen blir inbjuden och kan svara) eller neka (DELETE, med valfri förklaring).
@router.put("/{event_id}/requests/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def approve(event_id: int, user_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    event = _hosted_event_or_error(db, event_id, current_user.id)
    try:
        approve_event_request(db, event, user_id)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{event_id}/requests/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def decline(
    event_id: int,
    user_id: int,
    data: GroupJoinRequestCreate | None = Body(default=None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _hosted_event_or_error(db, event_id, current_user.id)
    message = data.message if data else None
    if message:
        check_fields(labels={"message": "Meddelandet"}, message=message)
    try:
        decline_event_request(db, event, user_id, current_user, message)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Medarrangörer (SCRUM-296) ----------


# Skaparen gör någon som är inbjuden eller har svarat till medarrangör (PUT), eller tar tillbaka det (DELETE).
@router.put("/{event_id}/hosts/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_host(event_id: int, user_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _set_host(db, event_id, user_id, current_user, True)


@router.delete("/{event_id}/hosts/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_host(event_id: int, user_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _set_host(db, event_id, user_id, current_user, False)


def _set_host(db: Session, event_id: int, user_id: int, current_user, host: bool) -> Response:
    event = _visible_event_or_404(db, event_id, current_user.id)
    if event.created_by != current_user.id:
        raise HTTPException(status_code=403, detail=msg.EVENT_ONLY_CREATOR_SETS_HOSTS)
    try:
        set_host(db, event, user_id, host)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
