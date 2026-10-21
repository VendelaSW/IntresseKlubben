"""
Anmälningar (se crud/report.py).

POST /reports - anmäler en användare, ett brev man har fått, eller ett
meddelande eller en lapp i en klubb man är med i. Anmälan sparas för granskning
(SCRUM-131), och den anmälda får inte veta vem som anmälde. 404 om det anmälda
inte finns eller man inte får se det, 400 om man anmäler sig själv.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_profile
from app.crud.report import ReportError, create_report
from app.db.session import get_db
from app.models.user import User
from app.schemas.report import ReportCreate, ReportOut

# Låst tills profilen är klar (se require_profile).
router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(require_profile)])


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def report(data: ReportCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return create_report(db, current_user.id, data)
    except ReportError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail)
