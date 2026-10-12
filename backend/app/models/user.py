from sqlalchemy import Column, DateTime, Index, Integer, String, func
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.user_interest import UserInterest


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # När intervjun blev klar eller hoppades över. None = ska erbjudas intervjun.
    onboarding_completed_at = Column(DateTime(timezone=True), nullable=True)

    # En rad per val, med aktivitet, styrka och egna ord (se UserInterest).
    interest_links = relationship("UserInterest", back_populates="user", cascade="all, delete-orphan")
    # Bara intressena, för kod som inte bryr sig om aktiviteten. Går att läsa,
    # tilldela och lägga till i som en vanlig lista: ett tillagt intresse får en
    # rad utan aktivitet. Samma intresse finns med en gång per aktivitet.
    interests = association_proxy(
        "interest_links", "interest", creator=lambda interest: UserInterest(interest=interest)
    )
    profile = relationship("Profile", back_populates="user", uselist=False)


# Skiftlägesokänsligt unikt: "Vendela" och "vendela" får inte båda finnas.
# create_user kollar redan detta i koden, indexet stoppar race conditions.
Index("uq_users_username_lower", func.lower(User.username), unique=True)
