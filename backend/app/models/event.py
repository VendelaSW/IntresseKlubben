import enum

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class EventVisibility(str, enum.Enum):
    open = "open"  # syns för alla inloggade, vem som helst kan svara
    invite_only = "invite_only"  # syns bara för skaparen och de inbjudna


class EventAnswer(str, enum.Enum):
    yes = "yes"
    maybe = "maybe"
    no = "no"


# Ett event: en träff vid en viss tid och plats, kopplad till ett intresse och
# valfritt till en klubb. Ett event utan klubb kan t.ex. vara bara mellan två
# vänner. Tiden sparas med tidszon.
class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    title = Column(String(50), nullable=False)
    description = Column(String(800), nullable=False)
    interest_id = Column(Integer, ForeignKey("interests.id"), nullable=False, index=True)
    starts_at = Column(DateTime(timezone=True), nullable=False, index=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    place_name = Column(String(100), nullable=False)
    address = Column(String(100), nullable=False)
    visibility = Column(Enum(EventVisibility), nullable=False, default=EventVisibility.invite_only)
    # Tas skaparen bort försvinner eventet med. Tas klubben bort finns eventet kvar.
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    interest = relationship("Interest")
    group = relationship("Group")
    creator = relationship("User")
    invitations = relationship("EventInvitation", back_populates="event", cascade="all, delete-orphan")
    responses = relationship("EventResponse", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="ck_events_ends_after_start"),)


# Vem som är inbjuden till ett event. En rad per person och event.
class EventInvitation(Base):
    __tablename__ = "event_invitations"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    event = relationship("Event", back_populates="invitations")

    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_invitations_event_user"),)


# Ja, Kanske eller Nej. Skilt från inbjudan, så att man kan svara på ett öppet
# event utan att ha blivit inbjuden. En rad per person och event.
class EventResponse(Base):
    __tablename__ = "event_responses"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    answer = Column(Enum(EventAnswer), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    event = relationship("Event", back_populates="responses")

    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_responses_event_user"),)
