"""
Lösenordshashning och inloggning.

Lösenord: delas mellan E:s registrering (hash_password vid create_user)
och F:s inloggning (verify_password vid login). Lösenord lagras ALDRIG
i klartext - bara hashen sparas i User.password_hash.

Inloggning: POST /users/login ger en signerad token (JWT) som frontend
skickar med i varje anrop som "Authorization: Bearer <token>".
get_current_user läser token och ger den inloggade användaren. Routes
som kräver inloggning tar in den med Depends(get_current_user).
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

TOKEN_ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(days=7)

# auto_error=False: vi ger själva ett svenskt 401 i stället för FastAPIs 403.
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """
    Hashar ett lösenord i klartext till en sträng som är säker att
    spara i databasen (User.password_hash).

    Används av crud.user.create_user() innan en ny User skapas.
    """
    password_bytes = password.encode("utf-8")
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """
    Kollar om ett lösenord i klartext matchar en sparad hash.

    Returnerar True/False - kastar inget undantag vid felaktigt
    lösenord, så F:s login-funktion kan hantera det som ett vanligt
    "fel lösenord"-fall istället för en krasch.
    """
    password_bytes = password.encode("utf-8")
    hash_bytes = password_hash.encode("utf-8")
    try:
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except ValueError:
        # password_hash är inte en giltig bcrypt-hash (t.ex. tom sträng)
        return False


def _require_secret() -> str:
    if not settings.jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Inloggning är inte konfigurerad på servern.",
        )
    return settings.jwt_secret


def create_access_token(user_id: int) -> str:
    """Signerad token som bevisar att användaren är inloggad, giltig i TOKEN_LIFETIME."""
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_LIFETIME}
    return jwt.encode(payload, _require_secret(), algorithm=TOKEN_ALGORITHM)


def _not_logged_in() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Du är inte inloggad.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI-dependency för routes som kräver inloggning.

    Ger 401 om token saknas, är ogiltig, har gått ut eller om
    användaren inte längre finns.
    """
    if credentials is None:
        raise _not_logged_in()
    try:
        payload = jwt.decode(credentials.credentials, _require_secret(), algorithms=[TOKEN_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _not_logged_in()

    user = db.get(User, user_id)
    if user is None:
        raise _not_logged_in()
    return user
