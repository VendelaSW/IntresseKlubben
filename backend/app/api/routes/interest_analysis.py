"""
Analys av användarens text till förslag på intressen.

POST /interests/analyze - tar emot ett fritt svar och returnerar AI-förslag: de intressen AI:n tror sig ha hittat,
  matchade mot biblioteket (ett intresse som finns, eller ett nytt med en förälder), med ett sigill över dem.
  Inget sparas här. Se app/services/interest_analysis.py för stegen.

Kräver inloggning. Varje anrop kostar pengar hos OpenAI, så det finns en gräns för hur ofta en användare får
anropa den. Gränsen räknas i minnet per användare och gäller per serverinstans, så den är en spärr och inget mer.
"""

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.core import error_messages as msg
from app.core.config import settings
from app.crud.interest import load_library_index
from app.crud.interest_library import LibraryError, load_activities
from app.db.session import get_db
from app.schemas.analysis import AnalyzeRequest, AnalyzeResponse
from app.services.ai_clients import AIFailed, AINotConfigured
from app.services.analysis_token import AnalysisTokenUnavailable, create_token
from app.services.interest_analysis import analyze

router = APIRouter(tags=["interests"])

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


@router.post("/interests/analyze", response_model=AnalyzeResponse)
def analyze_interests(
    data: AnalyzeRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_rate_limit(current_user.id)
    try:
        result = analyze(data.text, load_library_index(db), load_activities(), settings.interest_followups)
        token = create_token(current_user.id, result.sealed)
    except (AIFailed, AINotConfigured, AnalysisTokenUnavailable, LibraryError):
        # Att AI:n inte svarar, inte är inställd eller att sigillet inte går att skapa ger samma svar: användaren
        # kan välja sina intressen i listan i stället.
        raise HTTPException(status_code=503, detail=msg.ANALYZE_UNAVAILABLE)
    return {"token": token, "proposals": result.proposals, "followups": result.followups}
