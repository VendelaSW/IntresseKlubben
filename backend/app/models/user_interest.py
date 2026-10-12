import enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class UserInterestSource(str, enum.Enum):
    picker = "picker"  # valt i listan eller trädet på profilen
    onboarding = "onboarding"  # godkänt i intervjun när profilen skapades
    free_text = "free_text"  # beskrivet med egna ord på profilen


class UserInterest(Base):
    """Ett intresse på en användares profil. Samma intresse kan finnas flera
    gånger med olika aktivitet (någon både spelar och samlar Pokémon-kort), men
    inte två gånger med samma."""

    __tablename__ = "user_interests"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # index: snabb uppslagning av "vilka användare har intresse X?" (filtrering).
    interest_id = Column(Integer, ForeignKey("interests.id"), nullable=False, index=True)
    # Hur man håller på med intresset, en slug ur bibliotekets aktivitetslista
    # (t.ex. "spela"). Tom sträng = ingen aktivitet angiven. Inte null, så att
    # unik-villkoret nedan fungerar likadant i Postgres och i testdatabasen.
    activity = Column(String, nullable=False, default="", server_default="")
    # Hur mycket man gillar intresset, 1-3. Sparas men visas och används inte än.
    strength = Column(Integer, nullable=False, default=2, server_default="2")
    # Användarens egna ord ("letar fula porslinsfigurer på loppis"), eller None.
    label = Column(String, nullable=True)
    # Sträng i stället för databas-enum, så att nya värden inte kräver en migration.
    source = Column(
        String, nullable=False, default=UserInterestSource.picker.value, server_default="picker"
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="interest_links")
    # joined: intresset hämtas i samma fråga som raden, så att user.interests
    # inte ger en extra fråga per intresse.
    interest = relationship("Interest", lazy="joined")

    __table_args__ = (
        UniqueConstraint("user_id", "interest_id", "activity", name="uq_user_interests_user_interest_activity"),
    )
