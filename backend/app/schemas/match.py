"""Svaret från GET /matches: förslagen som personkort med poäng, och besked om den som frågar inte kan matchas än."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.profile import PersonResponse


class MatchResponse(PersonResponse):
    """En föreslagen person: personkortet plus hur bra matchningen är."""

    percent: int  # 0-100, aldrig under MIN_SHOWN_PERCENT (services/matching.py)
    shared_interests: list[str]  # namnen på intressen ni båda har valt
    low_confidence: bool  # True: baserat på lite information (få intressen, kort text eller en del saknas)


class MatchPageResponse(BaseModel):
    # not_ready: den som frågar har för lite i sin profil för att matchas. matches är då tom och
    # missing_* säger hur mycket som saknas. Filtret under Personer fungerar som vanligt.
    status: Literal["ok", "not_ready"]
    missing_interests: int
    missing_chars: int
    matches: list[MatchResponse]
    has_more: bool
