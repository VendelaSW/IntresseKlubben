import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class EventVisibility(str, enum.Enum):
    open = "open"  # syns för alla inloggade, vem som helst kan svara
    # Syns för alla inloggade, men man ber om att få vara med och skaparen (eller en medarrangör) godkänner
    # (SCRUM-296). Den som godkänns blir inbjuden och kan svara.
    application = "application"
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
    # Var på kartan eventet är (WGS84, grader). Valfritt: utan position visas
    # eventet i symbolen för sin kommun. Sätts bara tillsammans (se schemas/position.py).
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    visibility = Column(Enum(EventVisibility), nullable=False, default=EventVisibility.invite_only)
    # Av som standard: bara skaparen bjuder in. På: alla som ser eventet får bjuda in.
    guests_can_invite = Column(Boolean, nullable=False, default=False, server_default=false())
    # Valfritt område (SCRUM-295): ett län, landskap, en landsdel eller hela Sverige, som för klubbar (se GroupScope).
    # Utan område hör eventet till platsen (nålen, adressen eller klubbens kommun), som förut.
    scope = Column(String(10), nullable=True)
    scope_code = Column(String(10), nullable=True)
    # Valfritt: nivå (SkillLevel i models/group.py) och max antal som kommer (svarat Ja) (SCRUM-293).
    skill_level = Column(String(15), nullable=True)
    max_attendees = Column(Integer, nullable=True)
    # Tas skaparen bort försvinner eventet med. Tas klubben bort finns eventet kvar.
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    interest = relationship("Interest")
    group = relationship("Group")
    creator = relationship("User")
    invitations = relationship("EventInvitation", back_populates="event", cascade="all, delete-orphan")
    responses = relationship("EventResponse", back_populates="event", cascade="all, delete-orphan")
    join_requests = relationship(
        "EventJoinRequest",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="[EventJoinRequest.created_at, EventJoinRequest.id]",
    )
    hosts = relationship("EventHost", back_populates="event", cascade="all, delete-orphan")

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


# En ansökan till ett event man ansöker till (EventVisibility.application, SCRUM-296). Godkänns den blir
# personen inbjuden och kan svara, och nekas den tas raden bort, så att man kan ansöka igen.
class EventJoinRequest(Base):
    __tablename__ = "event_join_requests"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(String(200), nullable=True)  # valfritt meddelande till skaparen
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    event = relationship("Event", back_populates="join_requests")

    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_join_requests_event_user"),)


# En medarrangör (SCRUM-296), utsedd av skaparen: får ändra eventet, bjuda in och svara på ansökningar, men inte
# radera det.
class EventHost(Base):
    __tablename__ = "event_hosts"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    event = relationship("Event", back_populates="hosts")

    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_hosts_event_user"),)
