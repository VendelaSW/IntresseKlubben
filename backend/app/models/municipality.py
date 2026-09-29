from sqlalchemy import Column, String

from app.db.base import Base


# Sveriges kommuner. Fylls av migrationen b7e2d4f81c30 och ändras inte av appen.
class Municipality(Base):
    __tablename__ = "municipalities"

    code = Column(String(4), primary_key=True)  # SCB:s kommunkod, t.ex. "1480"
    name = Column(String, unique=True, nullable=False)
