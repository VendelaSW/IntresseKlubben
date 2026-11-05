from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db.base import Base
from app.models.email_token import utc_now


class ModerationWarning(Base):
    """
    En varning till en användare som har brutit mot reglerna, given av en moderator
    från en anmälan (SCRUM-268, se crud/moderation.py). Ett mellansteg före en
    avstängning: personen får en notis om vilken regel som bröts. Raderna sparas som
    historik, så att moderatorn ser tidigare varningar bredvid avstängningarna.
    (Inte "Warning", som är Pythons eget namn.)
    """

    __tablename__ = "warnings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reason = Column(String(20), nullable=False)  # ReportReason, regeln som bröts
    message = Column(String(500), nullable=True)  # moderatorns valfria meddelande till personen
    # Anmälan varningen gavs från, och moderatorn. None om kontot har raderats.
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    # I Python och inte i databasen, så att tiden har tidszon även i testerna (SQLite).
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
