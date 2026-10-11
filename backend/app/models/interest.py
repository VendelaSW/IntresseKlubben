import enum

from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.associations import user_interests


class InterestStatus(str, enum.Enum):
    active = "active"  # syns och går att välja
    pending = "pending"  # förslag som väntar på granskning (framtida "Föreslå ett intresse")
    inactive = "inactive"  # borttaget ur biblioteket; raderas aldrig, så att kopplingar finns kvar


class InterestSource(str, enum.Enum):
    library = "library"  # från intressebiblioteket (app/data/interests.json)
    user_suggestion = "user_suggestion"  # föreslaget av en användare
    ai = "ai"  # föreslaget eller godkänt av AI


class Interest(Base):
    """Ett intresse i intressebiblioteket. Intressena bildar ett träd via
    parent_id (t.ex. Sport och träning › Löpning). Biblioteket ligger i
    app/data/interests.json och läses in med app.sync_interests."""

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

    parent = relationship("Interest", remote_side=[id], back_populates="children")
    children = relationship("Interest", back_populates="parent")
    users = relationship("User", secondary=user_interests, back_populates="interests")
