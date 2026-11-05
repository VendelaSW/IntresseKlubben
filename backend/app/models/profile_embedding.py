from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func

from app.db.base import Base
from app.models.interest_embedding import EMBEDDING_DIMENSIONS


class ProfileEmbedding(Base):
    """Vektorn som säger vad Om mig-texten på en profil betyder, för att matchningen ska kunna jämföra personers texter.
    En rad per profil, i en egen tabell så att den tunga vektorn (1536 tal) inte följer med varje gång en profil läses
    (Personer-sidan, personkort). Raden finns bara när vektorn gick att räkna: saknas den används den inte, och
    `python -m app.sync_embeddings` fyller i den senare. Ändras texten tas raden bort och en ny skapas (services/profile_embeddings.py).

    embedding_hash säger vilken modell, storlek och text vektorn räknades på. I Postgres (Neon) är kolumnen en
    pgvector-kolumn, i testernas SQLite lagras den som JSON."""

    __tablename__ = "profile_embeddings"

    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    embedding = Column(Vector(EMBEDDING_DIMENSIONS).with_variant(JSON(), "sqlite"), nullable=False)
    embedding_hash = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
