from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func

from app.db.base import Base

# Antal tal i en vektor från embeddingsmodellen (se services/ai_clients.py). Ändras modellen eller storleken ändras
# också hashen på varje vektor (services/interest_embeddings.py), så att allt räknas om.
EMBEDDING_DIMENSIONS = 1536


class InterestEmbedding(Base):
    """Vektorn som säger vad ett intresse betyder, för att hitta intressen som betyder ungefär samma sak. En rad per
    intresse, i en egen tabell så att den tunga vektorn (1536 tal) inte följer med varje gång intressen läses, till
    exempel biblioteket vid varje analys. Raderna räknas av `python -m app.sync_embeddings`.

    embedding_hash säger vilken modell, storlek och text vektorn räknades på, så att bara det som ändrats räknas om.
    I Postgres (Neon) är kolumnen en pgvector-kolumn som går att söka i med avstånd. Testerna körs i SQLite, som saknar
    vektortyp, så där lagras den som JSON."""

    __tablename__ = "interest_embeddings"

    interest_id = Column(Integer, ForeignKey("interests.id", ondelete="CASCADE"), primary_key=True)
    embedding = Column(Vector(EMBEDDING_DIMENSIONS).with_variant(JSON(), "sqlite"), nullable=False)
    embedding_hash = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
