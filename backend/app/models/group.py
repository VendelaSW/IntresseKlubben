import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class GroupVisibility(str, enum.Enum):
    public = "public"  # syns i listor, vem som helst kan gå med
    application = "application"  # syns i listor, man ansöker och ägaren godkänner (SCRUM-159)
    private = "private"  # bara med inbjudan


class GroupScope(str, enum.Enum):
    """Klubbens räckvidd (SCRUM-282): vilket slags område den gäller. Området står i scope_code."""

    country = "country"  # hela Sverige (scope_code "SE")
    landsdel = "landsdel"  # Götaland, Svealand eller Norrland ("gotaland", "svealand", "norrland")
    landskap = "landskap"  # ett landskap, efter kartans kod ("1" = Skåne, se data/regions.json)
    lan = "lan"  # ett län, efter länskod ("14")
    kommun = "kommun"  # en kommun, efter kommunkod ("1480"), samma som municipality_code


class SkillLevel(str, enum.Enum):
    """Vilken nivå klubben passar för (SCRUM-216). Valfritt."""

    beginner = "beginner"  # Nybörjare
    intermediate = "intermediate"  # Medel
    experienced = "experienced"  # Erfaren
    all_levels = "all_levels"  # Alla nivåer


class GroupRole(str, enum.Enum):
    owner = "owner"
    # Utsedd av ägaren (SCRUM-160): godkänner ansökningar, tar bort medlemmar och modererar klubbchatten.
    admin = "admin"
    member = "member"


# En klubb (intressegrupp) samlar personer kring ett intresse i ett område: hela
# Sverige, en landsdel, ett landskap, ett län eller en kommun (se GroupScope).
class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(30), nullable=False)
    description = Column(String(200), nullable=False)
    meeting_info = Column(String(100), nullable=True)  # "När och var vi träffas"
    # Valfri träffplats: namn, adress och var på kartan (WGS84, grader). Utan
    # position visas klubben som en symbol för sitt område (se schemas/position.py).
    place_name = Column(String(100), nullable=True)
    address = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    interest_id = Column(Integer, ForeignKey("interests.id"), nullable=False, index=True)
    # Räckvidden (se GroupScope). Strängar och inte en enum i databasen, så att en ny nivå inte kräver en migration
    # av typen. Kommunen finns bara för räckvidden kommun, och är då samma som scope_code.
    scope = Column(String(10), nullable=False, default=GroupScope.kommun.value, server_default=GroupScope.kommun.value)
    # Utan angiven kod (t.ex. en klubb som skapas med bara en kommun, som innan räckvidden fanns) blir koden kommunen.
    scope_code = Column(String(10), nullable=False, default=lambda ctx: ctx.get_current_parameters().get("municipality_code"))
    municipality_code = Column(String(4), ForeignKey("municipalities.code"), nullable=True, index=True)
    # Valfritt: nivå (SkillLevel) och max antal medlemmar. En full klubb går inte att gå med i.
    skill_level = Column(String(15), nullable=True)
    max_members = Column(Integer, nullable=True)
    visibility = Column(Enum(GroupVisibility), nullable=False, default=GroupVisibility.public)
    # Av som standard: bara ägaren bjuder in. På: alla medlemmar får bjuda in.
    members_can_invite = Column(Boolean, nullable=False, default=False, server_default=false())
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    interest = relationship("Interest")
    municipality = relationship("Municipality")
    # Sorterad på när man gick med, så att den som varit med längst kommer först.
    members = relationship(
        "GroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="[GroupMember.joined_at, GroupMember.id]",
    )

    invitations = relationship("GroupInvitation", back_populates="group", cascade="all, delete-orphan")
    join_requests = relationship(
        "GroupJoinRequest",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="[GroupJoinRequest.created_at, GroupJoinRequest.id]",
    )

    __table_args__ = (
        # Samma namn får inte finnas två gånger i samma område, oavsett
        # stora/små bokstäver.
        Index("uq_groups_name_scope", func.lower(name), scope, scope_code, unique=True),
    )


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(GroupRole), nullable=False, default=GroupRole.member)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    group = relationship("Group", back_populates="members")

    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),)


# Vem som är inbjuden till en klubb. En rad per person och klubb. Den inbjudna
# blir inte medlem förrän hen själv går med, och raden tas bort då (eller när hen
# avböjer). Tas den som bjöd in bort finns inbjudan kvar.
class GroupInvitation(Base):
    __tablename__ = "group_invitations"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    group = relationship("Group", back_populates="invitations")

    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_invitations_group_user"),)


# En ansökan till en klubb där man ansöker (GroupVisibility.application). En rad per person och
# klubb, så länge ägaren inte har svarat. Godkänns den blir personen medlem, och nekas den tas raden
# bort, så att man kan ansöka igen. Sökande ser bara sin egen ansökan, ägaren alla.
class GroupJoinRequest(Base):
    __tablename__ = "group_join_requests"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(String(200), nullable=True)  # valfritt meddelande till ägaren
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    group = relationship("Group", back_populates="join_requests")

    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_join_requests_group_user"),)
