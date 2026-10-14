"""
Sigillet på en analys av användarens text (POST /interests/analyze).

Analysen ger förslag på intressen: vilka som redan finns, och vilka nya som ska skapas. Förslagen har gått
igenom utläsningen, granskningen, matchningen och kontrollerna. Sigillet är en signerad token som täcker
exakt de förslagen, så att den som sparar dem senare kan lita på dem utan att göra om kontrollen, och så att
ingen kan spara något som inte gått igenom den. Klienten kan inte skapa eller ändra ett sigill.

- Signerat med en nyckel härledd ur JWT_SECRET och syftet ("interest-analysis"), och med typen i innehållet.
  En inloggningstoken kan alltså inte godtas som sigill, och ett sigill kan inte godtas som inloggning (det
  har inget "sub", som inloggningen kräver).
- Bundet till användaren: ett sigill gäller bara för den som fick det.
- Giltigt i TOKEN_LIFETIME.
- Innehållet är förslagen i kompakt form, se proposal_claim.
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

TOKEN_LIFETIME = timedelta(minutes=30)
TOKEN_TYPE = "interest-analysis"
ALGORITHM = "HS256"


class AnalysisTokenUnavailable(Exception):
    """JWT_SECRET saknas, så inget sigill kan skapas."""


class InvalidAnalysisToken(Exception):
    """Sigillet är ogiltigt, har gått ut, tillhör någon annan eller har fel form."""


def _key() -> bytes:
    if not settings.jwt_secret:
        raise AnalysisTokenUnavailable()
    return hmac.new(settings.jwt_secret.encode("utf-8"), TOKEN_TYPE.encode("utf-8"), hashlib.sha256).digest()


def create_token(user_id: int, proposals: list[dict]) -> str:
    """Ett sigill över `proposals` åt användaren."""
    now = datetime.now(timezone.utc)
    payload = {"typ": TOKEN_TYPE, "uid": user_id, "iat": now, "exp": now + TOKEN_LIFETIME, "proposals": proposals}
    return jwt.encode(payload, _key(), algorithm=ALGORITHM)


def read_token(token: str, user_id: int) -> list[dict]:
    """Förslagen i sigillet, om det är giltigt och gäller användaren. Kastar InvalidAnalysisToken annars."""
    try:
        payload = jwt.decode(token, _key(), algorithms=[ALGORITHM], options={"require": ["exp", "iat", "uid", "typ"]})
    except jwt.InvalidTokenError:
        raise InvalidAnalysisToken() from None
    proposals = payload.get("proposals")
    if payload.get("typ") != TOKEN_TYPE or payload.get("uid") != user_id or not isinstance(proposals, list):
        raise InvalidAnalysisToken()
    return proposals
