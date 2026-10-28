"""
GET /matches - förslag på personer som matchar dig, bäst först, en sida i taget (limit och offset).

Appen visar dem ett i taget; kontaktförfrågan (POST /contacts/request) och "inte det här förslaget" (POST /users/{id}/dismiss)
finns redan. Hur poängen räknas står i services/matching.py och services/match_suggestions.py. Låst tills din egen profil är klar
(require_profile), som Personer.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, selectinload

from app.api.people import to_person_response
from app.auth.security import get_current_user, require_profile
from app.db.session import get_db
from app.models.profile import Profile
from app.models.user import User
from app.models.user_interest import UserInterest
from app.schemas.match import MatchPageResponse, MatchResponse
from app.services.match_suggestions import suggestions_for

router = APIRouter(prefix="/matches", tags=["matches"], dependencies=[Depends(require_profile)])


@router.get("", response_model=MatchPageResponse)
def read_matches(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchPageResponse:
    page = suggestions_for(db, current_user.id, limit, offset)
    users = {
        user.id: user
        for user in db.query(User)
        .options(
            selectinload(User.profile).selectinload(Profile.municipality),
            selectinload(User.interest_links).selectinload(UserInterest.interest),
        )
        .filter(User.id.in_([s.user_id for s in page.suggestions]))
    }
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
            )
        )
    return MatchPageResponse(
        status="ok" if page.readiness.ok else "not_ready",
        missing_interests=page.readiness.missing_interests,
        missing_chars=page.readiness.missing_chars,
        matches=matches,
        has_more=page.has_more,
    )
