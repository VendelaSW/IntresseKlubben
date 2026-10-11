from sqlalchemy.orm import Session

from app.core.profanity import censor_text
from app.crud.contact import blocked_user_ids
from app.models.group_message import GroupMessage


def send_group_message(db: Session, group_id: int, sender_id: int, content: str) -> GroupMessage:
    message = GroupMessage(group_id=group_id, sender_id=sender_id, content=censor_text(content))
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def get_group_messages(db: Session, group_id: int, viewer_id: int) -> list[GroupMessage]:
    """Gruppens meddelanden i tidsordning, utan dem från användare som är blockerade åt något håll."""
    query = db.query(GroupMessage).filter(GroupMessage.group_id == group_id)
    hidden = blocked_user_ids(db, viewer_id)
    if hidden:
        query = query.filter(GroupMessage.sender_id.not_in(hidden))
    # id som tiebreak, se get_conversation i crud/message.py.
    return query.order_by(GroupMessage.created_at, GroupMessage.id).all()
