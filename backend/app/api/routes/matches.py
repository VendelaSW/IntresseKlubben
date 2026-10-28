"""
GET /matches - förslag på personer som matchar dig, bäst först, en sida i taget (limit och offset).

Appen visar dem ett i taget; kontaktförfrågan (POST /contacts/request) och "inte det här förslaget" (POST /users/{id}/dismiss)
finns redan. Hur poängen räknas står i services/matching.py och services/match_suggestions.py. Låst tills din egen profil är klar
(require_profile), som Personer. Valfria filter: ?municipality_code=, ?gender= och ?min_age=/?max_age= (som GET /users/: bara dem som
valt att gå att hitta på kön, och på ålder bara dem som inte dolt den).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.api.people import to_person_response
from app.auth.security import get_current_user, require_profile
from app.db.session import get_db
from app.models.profile import GenderEnum, Profile
from app.models.user import User
from app.models.user_interest import UserInterest
from app.schemas.match import MatchPageResponse, MatchReason, MatchResponse, NearPair
from app.services.match_suggestions import reasons_for, suggestions_for

router = APIRouter(prefix="/matches", tags=["matches"], dependencies=[Depends(require_profile)])


@router.get("", response_model=MatchPageResponse)
def read_matches(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    municipality_code: str | None = None,
    gender: GenderEnum | None = None,
    min_age: int | None = Query(None, ge=0, le=120),
    max_age: int | None = Query(None, ge=0, le=120),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchPageResponse:
    if min_age is not None and max_age is not None and min_age > max_age:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lägsta åldern kan inte vara högre än den högsta.",
        )
    page = suggestions_for(
        db, current_user.id, limit, offset, municipality_code=municipality_code, gender=gender, min_age=min_age, max_age=max_age
    )
    users = {
        user.id: user
        for user in db.query(User)
        .options(
            selectinload(User.profile).selectinload(Profile.municipality),
            selectinload(User.interest_links).selectinload(UserInterest.interest),
        )
        .filter(User.id.in_([s.user_id for s in page.suggestions]))
    }
    reasons = reasons_for(db, current_user.id, page.suggestions)
    matches = []
    for suggestion in page.suggestions:
        user = users[suggestion.user_id]
        shared = sorted({link.interest.name for link in user.interest_links if link.interest_id in suggestion.match.shared})
        matches.append(
            MatchResponse(
                **to_person_response(db, user, current_user).model_dump(),
                percent=suggestion.match.percent,
                level=suggestion.match.level,
                shared_interests=shared,
                low_confidence=suggestion.match.low_confidence,
                reasons=[
                    MatchReason(kind=r.kind, interests=r.interests, pairs=[NearPair(mine=m, theirs=t) for m, t in r.pairs])
                    for r in reasons[suggestion.user_id]
                ],
            )
        )
    return MatchPageResponse(
        status="ok" if page.readiness.ok else "not_ready",
        missing_interests=page.readiness.missing_interests,
        missing_chars=page.readiness.missing_chars,
        matches=matches,
        has_more=page.has_more,
    )
