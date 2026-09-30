"""
Registrerings- och inloggningsendpoints för User.

POST /users/register - tar emot UserCreate (username, password),
skapar en ny User via crud.user.create_user, returnerar UserOut.

POST /users/login - tar emot UserLogin (username, password),
verifierar mot get_user_by_username + verify_password, returnerar
en inloggningstoken och UserOut vid korrekta uppgifter. Ger ett
generiskt 401-fel annars - avslöjar medvetet inte om det var
användarnamnet eller lösenordet som var fel (standard säkerhetspraxis).

GET /users/me - den inloggade användaren (kräver token).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, get_current_user, verify_password
from app.crud.user import UsernameTakenError, create_user, get_user_by_username
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import LoginResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    try:
        return create_user(db, user_in)
    except UsernameTakenError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Användarnamnet är upptaget.",
        )


@router.post("/login", response_model=LoginResponse)
def login_user(credentials: UserLogin, db: Session = Depends(get_db)) -> LoginResponse:
    user = get_user_by_username(db, credentials.username)
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Fel användarnamn eller lösenord.",
        )
    return LoginResponse(access_token=create_access_token(user.id), user=user)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user
