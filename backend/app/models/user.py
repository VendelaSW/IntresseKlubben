from sqlalchemy import Column, DateTime, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.associations import user_interests


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    display_name = Column(String, nullable=False)
    profile_text = Column(Text, nullable=True)
    profile_image_url = Column(String, nullable=True)
    city = Column(String, nullable=True)
    district = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    interests = relationship("Interest", secondary=user_interests, back_populates="users")
