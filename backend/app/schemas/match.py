"""Svaret från GET /matches: förslagen som personkort med poäng, och besked om den som frågar inte kan matchas än."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.profile import PersonResponse


class NearPair(BaseModel):
    mine: str  # ett av dina intressen
    theirs: str  # det av hens intressen som liknar det mest


class MatchReason(BaseModel):
    """Ett skäl till att personen föreslås. Backend skickar vad, frontend skriver meningen. Inga poäng eller siffror.

    shared     interests: intressen ni båda har valt
    near       pairs: dina intressen och hens som liknar dem utan att vara samma (Bouldering och Sportklättring)
    practices  interests: intressen ni båda utövar
    text       Om mig-texterna liknar varandra tydligt (ingen data utöver detta)
    area       interests: huvudområden ni båda har något under, när inget av de andra skälen finns
    """

    kind: Literal["shared", "near", "practices", "text", "area"]
    interests: list[str] = []
    pairs: list[NearPair] = []


class MatchResponse(PersonResponse):
    """En föreslagen person: personkortet plus hur bra matchningen är."""

    # Personens Om mig-text, som kortet visar i sin helhet (samma text som syns på personens profil, GET /users/{id}/profile).
    profile_text: str | None
    percent: int  # 0-100, aldrig under MIN_SHOWN_PERCENT (services/matching.py)
    # Nivån för poängen (LEVELS i services/matching.py): super, strong, good eller okay. Appen visar den, inte procenten.
    level: Literal["super", "strong", "good", "okay"]
    shared_interests: list[str]  # namnen på intressen ni båda har valt
    low_confidence: bool  # True: baserat på lite information (få intressen, kort text eller en del saknas)
    reasons: list[MatchReason]  # varför personen föreslås, de viktigaste först, högst tre


class MatchPageResponse(BaseModel):
    # not_ready: den som frågar har för lite i sin profil för att matchas. matches är då tom och
    # missing_* säger hur mycket som saknas. Filtret under Personer fungerar som vanligt.
    status: Literal["ok", "not_ready"]
    missing_interests: int
    missing_chars: int
    matches: list[MatchResponse]
    has_more: bool
