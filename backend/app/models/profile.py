import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.user import User  # noqa: F401 — behövs så SQLAlchemy känner till User


class GenderEnum(str, enum.Enum):
    kvinna = "kvinna"
    man = "man"
    ickebinar = "ickebinär"
    annat = "annat"
    vill_inte_uppge = "vill inte uppge"


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # Obligatoriska: en profil skapas alltid med alla fem (se ProfileCreate).
    name = Column(String(50), nullable=False)
    birth_date = Column(Date, nullable=False)
    gender = Column(Enum(GenderEnum), nullable=False)
    profile_text = Column(Text, nullable=False)
    municipality_code = Column(String(4), ForeignKey("municipalities.code"), nullable=False)

    profile_image_url = Column(String, nullable=True)
    district = Column(String, nullable=True)

    user = relationship("User", back_populates="profile")
    municipality = relationship("Municipality")