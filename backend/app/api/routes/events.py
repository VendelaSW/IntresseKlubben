from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.core import storage
from app.crud.event import (
    EventRuleError,
    create_event,
    delete_event,
    get_group_for_member,
    get_visible_event,
    invite,
    list_invitees,
    list_responses,
    list_visible_events,
    remove_invitation,
    set_answer,
    update_event,
)
from app.db.session import get_db
from app.models.event import Event, EventVisibility
from app.models.group import GroupVisibility
from app.models.interest import Interest
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

router = APIRouter(prefix="/events", tags=["events"])


def _to_response(event: Event, user_id: int) -> EventOut:
    creator = event.creator
    return EventOut(
        id=event.id,
        title=event.title,
        description=event.description,
        interest_id=event.interest_id,
        interest_name=event.interest.name,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        place_name=event.place_name,
        address=event.address,
        visibility=event.visibility,
        group_id=event.group_id,
        group_name=event.group.name if event.group else None,
        creator_username=creator.username,
        creator_name=creator.profile.name if creator.profile else None,
        is_owner=event.created_by == user_id,
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
        raise HTTPException(status_code=404, detail="Eventet finns inte")
    return event


def _to_attendees(db: Session, event: Event) -> list[EventAttendee]:
    return [
        EventAttendee(**_to_invitee(user).model_dump(), answer=response.answer)
        for response, user in list_responses(db, event)
    ]


def _own_event_or_error(db: Session, event_id: int, user_id: int) -> Event:
    event = _visible_event_or_404(db, event_id, user_id)
    if event.created_by != user_id:
        raise HTTPException(status_code=403, detail="Bara den som skapat eventet kan ändra det")
    return event


@router.post("/", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create(
    data: EventCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kolla här så att okända värden ger ett tydligt fel i stället för ett
    # databasfel (500) från de främmande nycklarna.
    if db.get(Interest, data.interest_id) is None:
        raise HTTPException(status_code=422, detail="Okänt intresse")
    if data.group_id is not None:
        try:
            group = get_group_for_member(db, data.group_id, current_user.id)
        except EventRuleError as err:
            raise HTTPException(status_code=err.status_code, detail=err.detail)
        # Privata klubbars events är alltid privata. Ett uttryckligt "open"
        # avvisas hellre än rättas tyst, så att felet syns direkt.
        if group.visibility == GroupVisibility.private and data.visibility == EventVisibility.open:
            raise HTTPException(status_code=422, detail="Events i privata klubbar kan inte vara öppna")
    event = create_event(db, current_user.id, data)
    return _to_response(event, current_user.id)


@router.get("/", response_model=list[EventOut])
def read_events(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_to_response(e, current_user.id) for e in list_visible_events(db, current_user.id)]


@router.patch("/{event_id}", response_model=EventOut)
def edit_event(
    event_id: int,
    data: EventUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _own_event_or_error(db, event_id, current_user.id)
    if data.interest_id is not None and db.get(Interest, data.interest_id) is None:
        raise HTTPException(status_code=422, detail="Okänt intresse")
    try:
        event = update_event(db, event, data)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return _to_response(event, current_user.id)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_event(
    event_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _own_event_or_error(db, event_id, current_user.id)
    delete_event(db, event)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{event_id}/invitations", response_model=list[ContactUser])
def read_invitations(
    event_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _own_event_or_error(db, event_id, current_user.id)
    return [_to_invitee(u) for u in list_invitees(db, event, current_user.id)]


@router.post("/{event_id}/invitations", response_model=list[ContactUser])
def add_invitations(
    event_id: int,
    data: EventInvite,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _own_event_or_error(db, event_id, current_user.id)
    try:
        invite(db, event, data.usernames, data.group_ids)
    except EventRuleError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
    return [_to_invitee(u) for u in list_invitees(db, event, current_user.id)]


@router.delete("/{event_id}/invitations/{username}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invitation(
    event_id: int,
    username: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _own_event_or_error(db, event_id, current_user.id)
    try:
        remove_invitation(db, event, username)
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
    return _to_attendees(db, event)


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
    set_answer(db, event, current_user.id, data.answer)
    return _to_attendees(db, event)
