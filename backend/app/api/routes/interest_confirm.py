"""
Sparar de förslag användaren godkänt (förslagen kommer från POST /interests/analyze).

POST /profile/interview/complete - en helt ny profil och dess intressen i ett anrop, när intervjun är klar. Allt
  sparas i en transaktion, så att en profil aldrig finns utan intresse och inget sparas förrän intervjun är klar.
POST /profile/interests/confirm - lägger till godkända förslag på en befintlig profil (redigering av intressen).

Bara förslag med giltigt sigill sparas. Se app/services/interest_confirm.py för reglerna.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.profile import _check_profile_text, _to_response
from app.auth.security import get_current_user
from app.core import error_messages as msg
from app.crud.profile import get_profile
from app.db.session import get_db
from app.models.municipality import Municipality
from app.models.profile import Profile
from app.models.user import User
from app.models.user_interest import UserInterestSource
from app.schemas.interest_confirm import (
    BatchIn,
    CompleteProfileRequest,
    CompleteProfileResponse,
    ConfirmInterestsRequest,
    ConfirmInterestsResponse,
    UserInterestOut,
)
from app.services.interest_confirm import ApprovedItem, Batch, ConfirmError, apply_batches
from app.services.text_moderation import check_fields

router = APIRouter(tags=["interests"])


def _batches(data: list[BatchIn]) -> list[Batch]:
    return [
        Batch(batch.token, tuple(ApprovedItem(i.key, i.all_activities, tuple(dict.fromkeys(i.narrow_to))) for i in batch.items))
        for batch in data
    ]


def _out(user: User) -> list[UserInterestOut]:
    rows = sorted(user.interest_links, key=lambda link: (link.interest.name.casefold(), link.activity))
    return [UserInterestOut(id=r.interest.id, name=r.interest.name, activity=r.activity, label=r.label) for r in rows]


def _apply(db: Session, user: User, data: list[BatchIn], source: str) -> None:
    try:
        apply_batches(db, user, _batches(data), source)
    except ConfirmError as error:
        db.rollback()
        raise HTTPException(status_code=error.status, detail=error.message) from None


@router.post("/profile/interests/confirm", response_model=ConfirmInterestsResponse)
def confirm_interests(
    data: ConfirmInterestsRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if get_profile(db, current_user.id) is None:
        raise HTTPException(status_code=404, detail=msg.PROFILE_NOT_FOUND)
    user = db.get(User, current_user.id)
    _apply(db, user, data.batches, UserInterestSource.free_text.value)
    db.commit()
    db.refresh(user)
    return {"interests": _out(user)}


@router.post("/profile/interview/complete", response_model=CompleteProfileResponse, status_code=201)
def complete_interview(
    data: CompleteProfileRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if get_profile(db, current_user.id) is not None:
        raise HTTPException(status_code=409, detail=msg.PROFILE_ALREADY_EXISTS)
    if db.get(Municipality, data.municipality_code) is None:
        raise HTTPException(status_code=422, detail=msg.UNKNOWN_MUNICIPALITY)
    check_fields(name=data.name, profile_text=data.profile_text, district=data.district)
    _check_profile_text(data.profile_text, current_user.id)
    user = db.get(User, current_user.id)
    profile = Profile(
        user_id=user.id,
        name=data.name,
        birth_date=data.birth_date,
        gender=data.gender,
        municipality_code=data.municipality_code,
        profile_text=data.profile_text,
        district=data.district,
        gender_searchable=data.gender_searchable,
    )
    db.add(profile)
    _apply(db, user, data.batches, UserInterestSource.onboarding.value)
    if not user.interest_links:
        # En profil får aldrig finnas utan intresse: inget sparas om inget förslag godkändes.
        db.rollback()
        raise HTTPException(status_code=422, detail=msg.CONFIRM_NO_INTERESTS)
    user.onboarding_completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    db.refresh(user)
    return {"profile": _to_response(profile), "interests": _out(user)}
