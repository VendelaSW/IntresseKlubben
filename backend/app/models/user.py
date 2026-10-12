from sqlalchemy import Column, DateTime, Index, Integer, String, func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.associations import user_interests


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    interests = relationship("Interest", secondary=user_interests, back_populates="users")
    profile = relationship("Profile", back_populates="user", uselist=False)

    @property
    def profile_completed(self) -> bool:
        """Har användaren gjort klart sin profil? Tills dess är resten av appen
        låst (se require_profile i auth/security.py). En profil kan bara sparas
        med alla obligatoriska fält och minst ett intresse, så att den finns
        betyder att den är klar. Ändras här om "klar" ska betyda mer, t.ex.
        onboarding_completed_at."""
        return self.profile is not None


# Skiftlägesokänsligt unikt: "Vendela" och "vendela" får inte båda finnas.
# create_user kollar redan detta i koden, indexet stoppar race conditions.
Index("uq_users_username_lower", func.lower(User.username), unique=True)
