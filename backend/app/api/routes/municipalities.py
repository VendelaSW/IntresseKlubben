from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.municipality import Municipality
from app.schemas.municipality import MunicipalityResponse

router = APIRouter(prefix="/municipalities", tags=["municipalities"])


# Sorteras i frontend med svensk ordning (å, ä, ö sist), eftersom databasens
# sortering beror på hur den är konfigurerad.
@router.get("/", response_model=list[MunicipalityResponse])
def list_municipalities(db: Session = Depends(get_db)):
    return db.query(Municipality).all()
