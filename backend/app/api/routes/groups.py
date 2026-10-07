from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.core import storage
from app.crud.contact import blocked_by_me_ids, blocked_user_ids
from app.crud.group import (
    GroupRuleError,
    GroupSort,
    create_group,
    delete_group,
    get_group,
    get_membership,
    join_group,
    leave_group,
    list_members,
    list_public_groups,
    list_suggested_groups,
    list_user_groups,
)
from app.crud.group_message import get_group_messages, send_group_message
from app.db.session import get_db
from app.models.group import Group, GroupRole, GroupVisibility
from app.models.interest import Interest
from app.models.municipality import Municipality
from app.schemas.group import GroupCreate, GroupMemberResponse, GroupResponse
from app.schemas.group_message import GroupMessageCreate, GroupMessageOut

router = APIRouter(prefix="/groups", tags=["groups"])


def _blocks(db: Session, user_id: int) -> tuple[set[int], set[int]]:
    """(hidden, blocked_by_me) för _to_response."""
    return blocked_user_ids(db, user_id), blocked_by_me_ids(db, user_id)


def _to_response(group: Group, user_id: int, hidden: set[int], blocked_by_me: set[int]) -> GroupResponse:
    # hidden = de som har blockerat dig eller som du har blockerat. De räknas
    # inte med i medlemsantalet, så att siffran stämmer med medlemslistan
    # (se list_members) och inte avslöjar någon dold.
    # blocked_by_me = bara de du själv har blockerat, för varningen
    # has_blocked_member. Den som har blockerat dig ger aldrig en varning,
    # eftersom du då skulle förstå att du är blockerad.
    membership = get_membership(group, user_id)
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        meeting_info=group.meeting_info,
        interest_id=group.interest_id,
        interest_name=group.interest.name,
        municipality_code=group.municipality_code,
        municipality_name=group.municipality.name,
        visibility=group.visibility,
        member_count=sum(1 for m in group.members if m.user_id not in hidden),
        is_member=membership is not None,
        is_owner=membership is not None and membership.role == GroupRole.owner,
        created_at=group.created_at,
        has_blocked_member=any(m.user_id in blocked_by_me for m in group.members),
    )


def _visible_group_or_404(db: Session, group_id: int, user_id: int) -> Group:
    # En privat grupp ska inte avslöjas för den som inte är med, så den ger
    # samma svar som en grupp som inte finns.
    group = get_group(db, group_id)
    if group is None or (
        group.visibility == GroupVisibility.private and get_membership(group, user_id) is None
    ):
        raise HTTPException(status_code=404, detail="Klubben finns inte")
    return group


@router.post("/", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
def create(
    data: GroupCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kolla här så att okända värden ger ett tydligt fel i stället för ett
    # databasfel (500) från de främmande nycklarna.
    if db.get(Interest, data.interest_id) is None:
        raise HTTPException(status_code=422, detail="Okänt intresse")
    if db.get(Municipality, data.municipality_code) is None:
        raise HTTPException(status_code=422, detail="Okänd kommun")
    try:
        group = create_group(db, current_user, data)
    except GroupRuleError as err:
        raise HTTPException(status_code=409, detail=str(err))
    return _to_response(group, current_user.id, *_blocks(db, current_user.id))


@router.get("/", response_model=list[GroupResponse])
def read_public_groups(
    interest_id: int | None = None,
    municipality_code: str | None = None,
    q: str | None = Query(None, max_length=100),
    sort: GroupSort = GroupSort.name,
    # Vänder sorteringen: Ö-A, färst medlemmar först, äldst först.
    reverse: bool = False,
    # Utan limit kommer alla, som innan sidindelningen fanns.
    limit: int | None = Query(None, ge=1, le=100),
    offset: int = Query(0, ge=0),
    # Fliken "Alla" visar bara klubbar man kan gå med i. Filtreras här, inte i
    # frontend, så att varje sida blir full.
    exclude_mine: bool = False,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hidden, blocked_by_me = _blocks(db, current_user.id)
    groups = list_public_groups(
        db,
        interest_id,
        municipality_code,
        q=q,
        sort=sort,
        reverse=reverse,
        limit=limit,
        offset=offset,
        exclude_member_id=current_user.id if exclude_mine else None,
        hidden_user_ids=hidden,
    )
    return [_to_response(g, current_user.id, hidden, blocked_by_me) for g in groups]


@router.get("/mine", response_model=list[GroupResponse])
def read_my_groups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    blocks = _blocks(db, current_user.id)
    return [_to_response(g, current_user.id, *blocks) for g in list_user_groups(db, current_user.id)]


@router.get("/suggested", response_model=list[GroupResponse])
def read_suggested_groups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    blocks = _blocks(db, current_user.id)
    return [_to_response(g, current_user.id, *blocks) for g in list_suggested_groups(db, current_user)]


@router.get("/{group_id}", response_model=GroupResponse)
def read_group(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    return _to_response(group, current_user.id, *_blocks(db, current_user.id))


# Alla som kan se klubben ser vilka som är med (en privat klubb syns bara
# för medlemmarna). Blockerade användare filtreras bort i list_members.
@router.get("/{group_id}/members", response_model=list[GroupMemberResponse])
def read_members(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    result = []
    for membership, member in list_members(db, group, current_user.id):
        profile = member.profile
        image_key = profile.profile_image_url if profile else None
        result.append(GroupMemberResponse(
            username=member.username,
            name=profile.name if profile else None,
            image_url=storage.public_url(image_key) if image_key else None,
            role=membership.role,
        ))
    return result


# PUT eftersom det går att upprepa: den som redan är med får samma svar.
@router.put("/{group_id}/members/me", response_model=GroupResponse)
def join(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    try:
        group = join_group(db, group, current_user)
    except GroupRuleError as err:
        raise HTTPException(status_code=409, detail=str(err))
    return _to_response(group, current_user.id, *_blocks(db, current_user.id))


@router.delete("/{group_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    leave_group(db, group, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _member_group_or_403(db: Session, group_id: int, user_id: int) -> Group:
    group = _visible_group_or_404(db, group_id, user_id)
    if get_membership(group, user_id) is None:
        raise HTTPException(status_code=403, detail="Du måste vara med i klubben för att se chatten")
    return group


@router.post("/{group_id}/messages", response_model=GroupMessageOut, status_code=status.HTTP_201_CREATED)
def create_group_message(
    group_id: int,
    message_in: GroupMessageCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = _member_group_or_403(db, group_id, current_user.id)
    return send_group_message(db, group.id, current_user.id, message_in.content)


@router.get("/{group_id}/messages", response_model=list[GroupMessageOut])
def read_group_messages(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _member_group_or_403(db, group_id, current_user.id)
    return get_group_messages(db, group.id, current_user.id)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    membership = get_membership(group, current_user.id)
    if membership is None or membership.role != GroupRole.owner:
        raise HTTPException(status_code=403, detail="Bara ägaren kan radera klubben")
    delete_group(db, group)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
