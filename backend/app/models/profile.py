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


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    name = Column(String(50), nullable=True)
    birth_date = Column(Date, nullable=True)
    gender = Column(Enum(GenderEnum), nullable=True)
    profile_text = Column(Text, nullable=True)
    profile_image_url = Column(String, nullable=True)
    municipality_code = Column(String(4), ForeignKey("municipalities.code"), nullable=True)
    district = Column(String, nullable=True)

    user = relationship("User", back_populates="profile")
    municipality = relationship("Municipality")