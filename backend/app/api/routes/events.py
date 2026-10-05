from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.crud.event import create_event, list_visible_events
from app.crud.group import get_group, get_membership
from app.db.session import get_db
from app.models.event import Event, EventVisibility
from app.models.group import GroupVisibility
from app.models.interest import Interest
from app.schemas.event import EventCreate, EventOut

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
        created_at=event.created_at,
    )


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
        # En privat klubb ska inte avslöjas för den som inte är med, så den
        # ger samma svar som en klubb som inte finns.
        group = get_group(db, data.group_id)
        membership = get_membership(group, current_user.id) if group else None
        if group is None or (group.visibility == GroupVisibility.private and membership is None):
            raise HTTPException(status_code=404, detail="Klubben finns inte")
        if membership is None:
            raise HTTPException(status_code=403, detail="Du måste vara med i klubben för att skapa events där")
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
