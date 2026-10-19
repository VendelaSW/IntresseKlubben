from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class EmailToken(Base):
    """
    En engångslänk som skickats i ett mejl, t.ex. för att bekräfta e-posten.

    Själva koden i länken sparas aldrig, bara dess hash (token_hash), så att en
    läckt databas inte går att använda för att logga in eller byta lösenord.
    Raden visar också när mejl skickats, för spärren mot för många mejl (se
    crud/email_token.py). `email` är adressen länken skickades till: byter man
    adress gäller en gammal länk inte för den nya.
    """

    __tablename__ = "email_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    purpose = Column(String(30), nullable=False)  # se PURPOSES i crud/email_token.py
    token_hash = Column(String(64), nullable=False, unique=True)
    email = Column(String, nullable=True)
    # I Python och inte i databasen, så att tiden har tidszon även i testerna (SQLite).
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)


Index("ix_email_tokens_user_purpose", EmailToken.user_id, EmailToken.purpose)
