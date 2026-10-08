"""
Intressen: biblioteket (söka och utforska) och ens egna intressen.

GET /interests/ - alla aktiva intressen, platt (för filter och formulär).
GET /interests/top - huvudområdena, för "Utforska" på intressesidan.
GET /interests/{id}/children - underintressena till ett intresse.
GET /interests/search?q= - intressen vars namn eller alias innehåller texten,
  bästa träffarna först, var och en med var den hör hemma (path).

GET /profile/interests, PUT/DELETE /profile/interests/{id} - ens egna intressen.
Bara aktiva intressen går att lägga till; ett inaktivt som man redan har går
att ta bort.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.core import error_messages as msg
from app.crud.interest import (
    add_user_interest,
    get_active_interest,
    get_interest,
    get_user,
    ids_with_children,
    interest_path,
    list_child_interests,
    list_interests,
    list_top_interests,
    remove_user_interest,
    search_interests,
    sorted_interests,
)
from app.db.session import get_db
from app.models.interest import Interest
from app.schemas.interest import InterestBrowseItem, InterestResponse

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


def _browse_items(db: Session, interests: list[Interest]) -> list[InterestBrowseItem]:
    with_children = ids_with_children(db, interests)
    return [
        InterestBrowseItem(id=i.id, name=i.name, path=interest_path(i), has_children=i.id in with_children)
        for i in interests
    ]


@router.get("/interests/", response_model=list[InterestResponse])
def read_interests(db: Session = Depends(get_db)):
    return list_interests(db)


@router.get("/interests/top", response_model=list[InterestBrowseItem])
def read_top_interests(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _browse_items(db, list_top_interests(db))


@router.get("/interests/search", response_model=list[InterestBrowseItem])
def search(
    q: str = Query(min_length=1, max_length=100),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _browse_items(db, search_interests(db, q))


@router.get("/interests/{interest_id}/children", response_model=list[InterestBrowseItem])
def read_child_interests(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interest = get_active_interest(db, interest_id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    return _browse_items(db, list_child_interests(db, interest))


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
    # Bara intressen som går att välja; ett inaktivt eller väntande svarar som
    # ett som inte finns.
    interest = get_active_interest(db, interest_id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    return add_user_interest(db, user, interest)


@router.delete("/profile/interests/{interest_id}", response_model=list[InterestResponse])
def remove_my_interest(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _current_db_user(current_user, db)
    interest = _interest_or_404(db, interest_id)
    # Ett intresse krävs alltid, så det sista går inte att ta bort. Att byta
    # ut det görs genom att först lägga till det nya, sen ta bort det gamla.
    if interest in user.interests and len(user.interests) == 1:
        raise HTTPException(status_code=409, detail=msg.LAST_INTEREST_CANNOT_BE_REMOVED)
    return remove_user_interest(db, user, interest)
