from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, UniqueConstraint, func

from app.db.base import Base


class DismissedSuggestion(Base):
    """En rad per (user_id, dismissed_user_id): user_id har valt att inte
    längre se dismissed_user_id som förslag under Personer. Ensidigt och
    påverkar inget annat (kontakter, blockering) - bara vad som visas i
    Förslag-fliken. Kan nollställas helt (se crud/dismissed_suggestion.py)."""

    __tablename__ = "dismissed_suggestions"
    __table_args__ = (
        CheckConstraint("user_id != dismissed_user_id", name="ck_dismissed_suggestions_distinct_users"),
        UniqueConstraint("user_id", "dismissed_user_id", name="uq_dismissed_suggestions_pair"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    dismissed_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
