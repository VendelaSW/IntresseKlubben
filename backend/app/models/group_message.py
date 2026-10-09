from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, func

from app.db.base import Base


class GroupMessage(Base):
    __tablename__ = "group_messages"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
