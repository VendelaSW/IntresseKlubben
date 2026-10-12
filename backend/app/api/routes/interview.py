"""
Intervjun när man skapar sin profil.

POST /profile/interview/interests - läser ut intressen ur fri text med en språkmodell, som ett träd
  av fria taggar (intresse och subs). De matchas inte mot biblioteket än och sparas inte.

Kräver inloggning. Varje anrop kostar pengar hos OpenAI, så det finns en gräns för hur ofta en
användare får anropa den. Gränsen räknas i minnet per användare och gäller per serverinstans, så
den är en spärr och inget mer.
"""

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException

from app.auth.security import get_current_user
from app.core import error_messages as msg
from app.schemas.interview import InterestExtractRequest, InterestExtractResponse
from app.services import interest_extractor
from app.services.ai_clients import AIFailed, AINotConfigured

router = APIRouter(prefix="/profile/interview", tags=["interview"])

# Högst så här många anrop per användare under så här många sekunder.
RATE_LIMIT = 10
RATE_WINDOW_SECONDS = 60

_recent: dict[int, deque[float]] = defaultdict(deque)


def _check_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    calls = _recent[user_id]
    while calls and now - calls[0] > RATE_WINDOW_SECONDS:
        calls.popleft()
    if len(calls) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail=msg.INTERVIEW_TOO_MANY_REQUESTS)
    calls.append(now)


@router.post("/interests", response_model=InterestExtractResponse)
def extract_interests(data: InterestExtractRequest, current_user=Depends(get_current_user)):
    _check_rate_limit(current_user.id)
    try:
        interests = interest_extractor.extract_interests(data.text)
    except AINotConfigured:
        raise HTTPException(status_code=503, detail=msg.INTERVIEW_AI_NOT_CONFIGURED)
    except AIFailed:
        raise HTTPException(status_code=502, detail=msg.INTERVIEW_AI_FAILED)
    return {"interests": interests}
