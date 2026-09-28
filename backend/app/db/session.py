from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# pool_pre_ping: testar connections innan de återanvänds. Viktigt i en
# serverless-miljö (Vercel Functions) där en connection annars kan ha
# blivit stängd mellan två anrop.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI-dependency: lånar ut en session per request, stänger den efteråt.

    Används i endpoints som: def route(db: Session = Depends(get_db)):
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
