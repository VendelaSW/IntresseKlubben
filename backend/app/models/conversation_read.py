from sqlalchemy import Column, DateTime, ForeignKey, Integer, func

from app.db.base import Base


class ConversationRead(Base):
    """Hur långt en användare har läst i sin konversation med en annan: id:t på
    det senaste brevet hen har sett, och när. Sparas på kontot, så att ett läst
    brev är läst i alla webbläsare och på alla enheter (se mark_conversation_read
    i crud/message.py).

    Brevets id används i stället för en tid, eftersom id:n alltid växer medan
    två brev kan få samma tid. Ingen främmande nyckel till messages, så att
    raden inte står i vägen när brev raderas."""

    __tablename__ = "conversation_reads"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    other_user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    last_read_message_id = Column(Integer, nullable=False)
    read_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
