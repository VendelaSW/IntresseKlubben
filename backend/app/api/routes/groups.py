from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.core import storage
from app.crud.group import (
    GroupRuleError,
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
from app.db.session import get_db
from app.models.group import Group, GroupRole, GroupVisibility
from app.models.interest import Interest
from app.models.municipality import Municipality
from app.schemas.group import GroupCreate, GroupMemberResponse, GroupResponse

router = APIRouter(prefix="/groups", tags=["groups"])


def _to_response(group: Group, user_id: int) -> GroupResponse:
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
        member_count=len(group.members),
        is_member=membership is not None,
        is_owner=membership is not None and membership.role == GroupRole.owner,
        created_at=group.created_at,
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
    return _to_response(group, current_user.id)


@router.get("/", response_model=list[GroupResponse])
def read_public_groups(
    interest_id: int | None = None,
    municipality_code: str | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    groups = list_public_groups(db, interest_id, municipality_code)
    return [_to_response(g, current_user.id) for g in groups]


@router.get("/mine", response_model=list[GroupResponse])
def read_my_groups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return [_to_response(g, current_user.id) for g in list_user_groups(db, current_user.id)]


@router.get("/suggested", response_model=list[GroupResponse])
def read_suggested_groups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return [_to_response(g, current_user.id) for g in list_suggested_groups(db, current_user)]


@router.get("/{group_id}", response_model=GroupResponse)
def read_group(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _to_response(_visible_group_or_404(db, group_id, current_user.id), current_user.id)


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
    return _to_response(group, current_user.id)


@router.delete("/{group_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    leave_group(db, group, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    group = _visible_group_or_404(db, group_id, current_user.id)
    membership = get_membership(group, current_user.id)
    if membership is None or membership.role != GroupRole.owner:
        raise HTTPException(status_code=403, detail="Bara ägaren kan radera klubben")
    delete_group(db, group)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
