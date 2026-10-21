import enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.db.base import Base
from app.models.email_token import utc_now


class ReportTarget(str, enum.Enum):
    """Vad anmälan gäller."""

    profile = "profile"  # en användare (från profilen)
    message = "message"  # ett brev (messages)
    group_message = "group_message"  # ett meddelande i en klubbchatt
    group_post = "group_post"  # en lapp på klubbens anslagstavla


class ReportReason(str, enum.Enum):
    harassment = "harassment"  # trakasserier eller hot
    inappropriate = "inappropriate"  # olämpligt eller sexuellt innehåll
    spam = "spam"  # spam eller bedrägeri
    fake_profile = "fake_profile"  # falsk profil
    other = "other"  # annat


class Report(Base):
    """
    En anmälan av en användare, eller av något hen har skrivit, så att den kan
    granskas (SCRUM-131). Den anmälda får inte veta vem som anmälde.

    Gäller anmälan något skrivet sparas en kopia av texten (`content`), så att
    den går att granska även om meddelandet eller lappen tas bort. `target_id`
    pekar på det anmälda (ingen främmande nyckel, eftersom det kan raderas).
    Raderas ett konto finns anmälan kvar men utan koppling till kontot
    (reporter_id och reported_user_id sätts till tomt, se delete_user).
    """

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reported_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    target_type = Column(String(20), nullable=False)  # ReportTarget
    target_id = Column(Integer, nullable=True)  # None för en profil
    content = Column(Text, nullable=True)  # kopia av det anmälda meddelandet eller lappen
    reason = Column(String(20), nullable=False)  # ReportReason
    comment = Column(Text, nullable=True)
    # "new" tills någon har granskat den (SCRUM-131).
    status = Column(String(20), nullable=False, default="new")
    # I Python och inte i databasen, så att tiden har tidszon även i testerna (SQLite).
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
