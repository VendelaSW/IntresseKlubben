from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, false, func
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
    # När e-postadressen bekräftades via länken i mejlet. None = inte bekräftad,
    # t.ex. konton från innan bekräftelsen fanns, eller efter att man bytt adress.
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    # När lösenordet senast byttes (återställt eller ändrat). Inloggningar som skapades
    # innan dess slutar gälla, så att ett nytt lösenord loggar ut andra enheter.
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # När intervjun blev klar eller hoppades över. None = ska erbjudas intervjun.
    onboarding_completed_at = Column(DateTime(timezone=True), nullable=True)
    # Moderatorer hanterar anmälningar och kan stänga av användare (SCRUM-131).
    # Sätts med `python -m app.make_moderator <användarnamn>`, aldrig i appen.
    is_moderator = Column(Boolean, nullable=False, default=False, server_default=false())

    # En rad per val, med aktivitet, styrka och egna ord (se UserInterest).
    interest_links = relationship("UserInterest", back_populates="user", cascade="all, delete-orphan")
    # Bara intressena, för kod som inte bryr sig om aktiviteten. Går att läsa
    # och lägga till i som en vanlig lista: ett tillagt intresse får en rad utan
    # aktivitet. Samma intresse finns med en gång per aktivitet. Byt inte ut
    # hela listan (user.interests = [...]) för någon som redan har intressen:
    # då skapas nya rader innan de gamla tas bort, och unik-villkoret slår till.
    # Använd crud.interest.set_user_interests.
    interests = association_proxy(
        "interest_links", "interest", creator=lambda interest: UserInterest(interest=interest)
    )
    profile = relationship("Profile", back_populates="user", uselist=False)

    @property
    def email_verified(self) -> bool:
        """Har användaren bekräftat sin nuvarande e-postadress via länken i mejlet?"""
        return self.email is not None and self.email_verified_at is not None

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
