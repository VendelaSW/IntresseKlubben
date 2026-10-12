import enum

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class InterestStatus(str, enum.Enum):
    active = "active"  # syns och går att välja
    pending = "pending"  # förslag som väntar på granskning (framtida "Föreslå ett intresse")
    inactive = "inactive"  # borttaget ur biblioteket; raderas aldrig, så att kopplingar finns kvar


class InterestSource(str, enum.Enum):
    library = "library"  # från intressebiblioteket (app/data/interests.json)
    user_suggestion = "user_suggestion"  # föreslaget av en användare
    ai = "ai"  # föreslaget eller godkänt av AI


class Interest(Base):
    """Ett intresse. Intressena bildar ett träd via parent_id (t.ex. Sport och
    träning › Löpning). Biblioteket ligger i app/data/interests.json och läses
    in med app.sync_interests. Egna intressen, som en användare skapat för att
    inget i biblioteket passade, finns bara här i databasen (source =
    user_suggestion, created_by_user_id satt)."""

    __tablename__ = "interests"

    id = Column(Integer, primary_key=True)
    # Inte unikt: samma namn kan finnas under flera huvudområden (Fantasy under
    # både Film och tv och Böcker). slug är det unika.
    name = Column(String, nullable=False)
    # Fast id i biblioteket, så att ett namn kan ändras utan att kopplingarna försvinner.
    slug = Column(String, unique=True, nullable=True)
    parent_id = Column(Integer, ForeignKey("interests.id"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    # Andra ord att söka på, ett per rad (t.ex. "springa" för Löpning).
    aliases = Column(Text, nullable=True)
    # Strängar i stället för databas-enum, så att nya värden inte kräver en migration.
    status = Column(String, nullable=False, default=InterestStatus.active.value, server_default="active")
    source = Column(String, nullable=False, default=InterestSource.library.value, server_default="library")
    # Hur intresset kan utövas: slugs ur bibliotekets aktivitetslista, t.ex.
    # ["spela", "samla"]. None = inga angivna.
    activities = Column(JSON, nullable=True)
    # Intressets betydelse som en vektor, för att hitta intressen som betyder
    # ungefär samma sak. embedding_hash säger vilken text vektorn räknades på,
    # så att synken bara räknar om intressen som har ändrats.
    embedding = Column(JSON, nullable=True)
    embedding_hash = Column(String, nullable=True)
    # Vem som skapade ett eget intresse. Raderas kontot finns intresset kvar för
    # andra som har det, utan skapare.
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    parent = relationship("Interest", remote_side=[id], back_populates="children")
    children = relationship("Interest", back_populates="parent")
