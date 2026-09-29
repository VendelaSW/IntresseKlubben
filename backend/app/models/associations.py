from sqlalchemy import Column, ForeignKey, Table

from app.db.base import Base

# Kopplingstabell mellan User och Interest (många-till-många).
user_interests = Table(
    "user_interests",
    Base.metadata,
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("interest_id", ForeignKey("interests.id"), primary_key=True),
)
