from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String, UniqueConstraint

from app.db.base import Base


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        CheckConstraint("requester_id != addressee_id", name="ck_contacts_distinct_users"),
        CheckConstraint("status IN ('PENDING', 'ACCEPTED', 'BLOCKED')", name="ck_contacts_status"),
        UniqueConstraint("pair_key", name="uq_contacts_pair_key"),
    )

    id = Column(Integer, primary_key=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pair_key = Column(String, nullable=False)
    status = Column(String, nullable=False)