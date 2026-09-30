from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.crud.interest import (
    add_user_interest,
    get_interest,
    get_user,
    list_interests,
    remove_user_interest,
    sorted_interests,
)
from app.db.session import get_db
from app.schemas.interest import InterestResponse

router = APIRouter(tags=["interests"])


def _current_db_user(current_user, db: Session):
    user = get_user(db, current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="Användaren finns inte")
    return user


def _interest_or_404(db: Session, interest_id: int):
    interest = get_interest(db, interest_id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    return interest


@router.get("/interests/", response_model=list[InterestResponse])
def read_interests(db: Session = Depends(get_db)):
    return list_interests(db)


@router.get("/profile/interests", response_model=list[InterestResponse])
def read_my_interests(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sorted_interests(_current_db_user(current_user, db))


# PUT eftersom det går att upprepa: redan tillagt intresse ger samma svar.
@router.put("/profile/interests/{interest_id}", response_model=list[InterestResponse])
def add_my_interest(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _current_db_user(current_user, db)
    interest = _interest_or_404(db, interest_id)
    return add_user_interest(db, user, interest)


@router.delete("/profile/interests/{interest_id}", response_model=list[InterestResponse])
def remove_my_interest(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _current_db_user(current_user, db)
    interest = _interest_or_404(db, interest_id)
    return remove_user_interest(db, user, interest)
