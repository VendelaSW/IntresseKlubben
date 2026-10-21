from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db.base import Base
from app.models.email_token import utc_now


class Suspension(Base):
    """
    En avstängning av en användare, gjord av en moderator (se crud/moderation.py).
    Raderna sparas som historik, så att moderatorn ser om någon har varit avstängd
    förut. En avstängning gäller från `starts_at` till `until` (None = tills
    vidare), om den inte hävs innan (`lifted_at`). En tidsbegränsad avstängning
    slutar gälla av sig själv: servern jämför tiden, inget behöver köras.
    """

    __tablename__ = "suspensions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # I Python och inte i databasen, så att tiden har tidszon även i testerna (SQLite).
    starts_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    until = Column(DateTime(timezone=True), nullable=True)
    reason = Column(String(20), nullable=False)  # ReportReason
    # Moderatorn som stängde av och som hävde. None om det kontot har raderats.
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    lifted_at = Column(DateTime(timezone=True), nullable=True)
    lifted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
