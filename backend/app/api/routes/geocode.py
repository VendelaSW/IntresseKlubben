"""
Adressökning för att sätta ut var ett event eller en klubb är på kartan.

GET /geocode?q=... - upp till fem träffar i Sverige för en adress eller ett platsnamn, från
  Nominatim (se app/services/geocoding.py). Bara söktexten skickas vidare, aldrig vem som söker.

Kräver inloggning och klar profil (det är där man skapar events och klubbar). Varje användare får
söka ett begränsat antal gånger per minut, så att ingen kan använda appen för att ösa anrop mot
Nominatim. Gränsen räknas i minnet per serverinstans, så den är en spärr och inget mer.
"""

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.security import get_current_user, require_profile
from app.core import error_messages as msg
from app.schemas.geocode import GeocodeResult
from app.services.geocoding import GeocodingFailed, get_geocoder

router = APIRouter(prefix="/geocode", tags=["geocode"], dependencies=[Depends(require_profile)])

MIN_QUERY_LENGTH = 3
MAX_QUERY_LENGTH = 200
# Högst så här många sökningar per användare under så här många sekunder.
RATE_LIMIT = 20
RATE_WINDOW_SECONDS = 60

_recent: dict[int, deque[float]] = defaultdict(deque)


def _check_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    calls = _recent[user_id]
    while calls and now - calls[0] > RATE_WINDOW_SECONDS:
        calls.popleft()
    if len(calls) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail=msg.GEOCODE_TOO_MANY_REQUESTS)
    calls.append(now)


@router.get("", response_model=list[GeocodeResult])
def geocode(q: str = Query(""), current_user=Depends(get_current_user)):
    query = q.strip()
    if len(query) < MIN_QUERY_LENGTH:
        raise HTTPException(status_code=422, detail=msg.GEOCODE_QUERY_TOO_SHORT)
    if len(query) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=422, detail=msg.GEOCODE_QUERY_TOO_LONG)
    _check_rate_limit(current_user.id)
    try:
        places = get_geocoder().search(query)
    except GeocodingFailed:
        raise HTTPException(status_code=503, detail=msg.GEOCODE_UNAVAILABLE) from None
    return [GeocodeResult(label=p.label, latitude=p.latitude, longitude=p.longitude) for p in places]
