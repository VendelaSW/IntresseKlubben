import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
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
    private = "private"  # bara med inbjudan (inbjudningar byggs senare)


class GroupRole(str, enum.Enum):
    owner = "owner"
    member = "member"


# En klubb (intressegrupp) samlar personer kring ett intresse i en kommun.
class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(30), nullable=False)
    description = Column(String(200), nullable=False)
    meeting_info = Column(String(100), nullable=True)  # "När och var vi träffas"
    interest_id = Column(Integer, ForeignKey("interests.id"), nullable=False, index=True)
    municipality_code = Column(String(4), ForeignKey("municipalities.code"), nullable=False, index=True)
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

    __table_args__ = (
        # Samma namn får inte finnas två gånger i samma kommun, oavsett
        # stora/små bokstäver.
        Index("uq_groups_name_municipality", func.lower(name), municipality_code, unique=True),
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
