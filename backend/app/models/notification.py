import enum

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.db.base import Base
from app.models.email_token import utc_now


class NotificationKind(str, enum.Enum):
    """Vad notisen gäller. Nya sorter läggs till här och skapas med notify() i crud/notification.py."""

    event_cancelled = "event_cancelled"  # eventet man skulle gå på är inställt (raderat)
    event_changed = "event_changed"  # eventet har fått ny tid och/eller plats
    group_join_request = "group_join_request"  # någon ansöker till ens klubb (till ägaren)
    group_request_approved = "group_request_approved"  # ens ansökan till en klubb är godkänd
    group_request_declined = "group_request_declined"  # ens ansökan till en klubb fick nej
    group_role_changed = "group_role_changed"  # man har blivit (eller inte längre är) administratör i en klubb
    group_member_removed = "group_member_removed"  # man har tagits bort ur en klubb


class Notification(Base):
    """
    En notis från Intresseklubben till en användare, t.ex. att ett event man
    skulle gå på har ställts in. Allmän, så att alla sorters besked kan skickas
    på samma sätt: en rubrik, en text, ett valfritt citat (någons eget
    meddelande) och en valfri länk till det notisen gäller. Texten skrivs när
    notisen skapas och sparas som den är, eftersom det den handlar om (t.ex. ett
    inställt event) kanske inte finns kvar.

    Visas på sidan Notiser, där man kan ta bort dem, och olästa räknas i
    märket (se GET /users/me/badges).
    """

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kind = Column(String(30), nullable=False)  # NotificationKind
    title = Column(String(150), nullable=False)
    body = Column(Text, nullable=True)
    # Någons eget meddelande som följer med, t.ex. skaparens "Inställt pga sjukdom".
    quote = Column(Text, nullable=True)
    # Vem citatet är från (visas under det).
    quote_by = Column(String(100), nullable=True)
    # Sidan i appen notisen gäller, t.ex. "/events?event=3". None om det inte finns något att visa.
    link = Column(String(200), nullable=True)
    # I Python och inte i databasen, så att tiden har tidszon även i testerna (SQLite).
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    read_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def read(self) -> bool:
        return self.read_at is not None


Index("ix_notifications_user_created", Notification.user_id, Notification.created_at)
