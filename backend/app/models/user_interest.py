import enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class UserInterestSource(str, enum.Enum):
    picker = "picker"  # valt i listan eller trädet på profilen
    onboarding = "onboarding"  # godkänt i intervjun när profilen skapades
    free_text = "free_text"  # beskrivet med egna ord på profilen


# activity när personen själv håller på med intresset (SCRUM-271). Annars är den tom: intresserad.
PRACTISES = "utova"
# Bibliotekets aktiviteter där man själv håller på med intresset. De andra (titta, lyssna, lasa, besoka, ha)
# är att vara intresserad. Samma uppdelning som migrationen e8c4a1f7b305 gjorde av de sparade raderna.
PRACTISING_ACTIVITIES = frozenset(
    {"utova", "spela", "tavla", "leda", "lara-sig", "skapa", "bygga", "samla", "laga", "prova", "kora"}
)


def practice_from(activities) -> str:
    """PRACTISES om någon av aktiviteterna är en där man själv håller på, annars "" (intresserad)."""
    return PRACTISES if any(a in PRACTISING_ACTIVITIES for a in activities) else ""


class UserInterest(Base):
    """Ett intresse på en användares profil, en gång per person. activity säger om
    personen själv håller på med det (PRACTISES) eller bara är intresserad ("")."""

    __tablename__ = "user_interests"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # index: snabb uppslagning av "vilka användare har intresse X?" (filtrering).
    interest_id = Column(Integer, ForeignKey("interests.id"), nullable=False, index=True)
    # PRACTISES ("utova") om personen själv håller på med intresset, annars "" (intresserad). En sträng och inte
    # en boolean, eftersom det tidigare var en av 16 aktiviteter (se migrationen e8c4a1f7b305).
    activity = Column(String, nullable=False, default="", server_default="")
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

    __table_args__ = (UniqueConstraint("user_id", "interest_id", name="uq_user_interests_user_interest"),)
