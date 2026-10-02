from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter()


@router.get("/health")
def health_check():
    """Kollar bara att appen svarar, ingen kontakt med databasen."""
    return {"status": "ok"}


@router.get("/health/db")
def health_check_db(db: Session = Depends(get_db)):
    """Kollar att den poolade Neon-anslutningen faktiskt fungerar."""
    db.execute(text("SELECT 1"))
    return {"status": "ok"}
