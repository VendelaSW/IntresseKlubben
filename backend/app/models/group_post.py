from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, func

from app.db.base import Base


class GroupPost(Base):
    """Ett inlägg i en klubb (t.ex. nyheter eller regler). Till skillnad från
    chatten (GroupMessage) ligger inläggen kvar överst tills någon raderar dem:
    den som skrev inlägget, eller klubbens ägare."""

    __tablename__ = "group_posts"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
