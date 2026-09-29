"""
Registrerings-endpoint.

POST /users/register - tar emot UserCreate (username, password),
skapar en ny User via crud.user.create_user, returnerar UserOut.

OBS: se schemas/user.py och crud/user.py - scopat till bara
username + password just nu. Ett anrop kommer krascha med ett 500
(IntegrityError på display_name) tills PO:s profile.py-lösning är
på plats, eftersom User.display_name fortfarande är nullable=False
i databasen. Förväntat just nu, inte en bugg i den här filen.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud.user import UsernameTakenError, create_user
from app.db.session import get_db
from app.schemas.user import UserCreate, UserOut

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
