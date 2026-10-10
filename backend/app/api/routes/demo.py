"""
Demon: läser ut intressen ur fri text med en språkmodell, som fria taggar (inte ur biblioteket).

Endpointen är bara till för att testa idén lokalt. Den är avstängd (404) om inte
DEMO_AI är satt, kräver ingen inloggning (demon har ingen) och har därför en gräns för
hur ofta den får anropas, så att ingen kan bränna nyckelns budget. Gränsen räknas i
minnet per IP-adress och gäller per serverinstans, så den är en spärr och inget mer.
Kör den inte öppet i produktion.
"""

import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request

from app.core import error_messages as msg
from app.core.config import settings
from app.schemas.demo import InterestExtractRequest, InterestExtractResponse
from app.services import interest_extractor
from app.services.interest_extractor import ExtractorFailed, ExtractorNotConfigured

router = APIRouter(prefix="/demo", tags=["demo"])

# Högst så här många anrop per IP-adress under så här många sekunder.
RATE_LIMIT = 10
RATE_WINDOW_SECONDS = 60

_recent: dict[str, deque[float]] = defaultdict(deque)


def _check_rate_limit(client: str) -> None:
    now = time.monotonic()
    calls = _recent[client]
    while calls and now - calls[0] > RATE_WINDOW_SECONDS:
        calls.popleft()
    if len(calls) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail=msg.DEMO_TOO_MANY_REQUESTS)
    calls.append(now)


@router.post("/extract-interests", response_model=InterestExtractResponse)
def extract_interests(data: InterestExtractRequest, request: Request):
    # Avstängd: samma svar som en sida som inte finns.
    if not settings.demo_ai:
        raise HTTPException(status_code=404, detail=msg.DEMO_NOT_FOUND)
    _check_rate_limit(request.client.host if request.client else "okänd")
    try:
        interests = interest_extractor.extract_interests(data.text)
    except ExtractorNotConfigured:
        raise HTTPException(status_code=503, detail=msg.DEMO_AI_NOT_CONFIGURED)
    except ExtractorFailed:
        raise HTTPException(status_code=502, detail=msg.DEMO_AI_FAILED)
    return {"interests": interests}
