from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.message import Message


class CannotMessageSelfError(Exception):
    """Avsändare och mottagare är samma användare."""


def send_message(db: Session, sender_id: int, recipient_id: int, text: str) -> Message:
    if sender_id == recipient_id:
        raise CannotMessageSelfError(sender_id)

    message = Message(sender_id=sender_id, recipient_id=recipient_id, text=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def get_conversation(db: Session, user_a_id: int, user_b_id: int) -> list[Message]:
    return (
        db.query(Message)
        .filter(
            or_(
                and_(Message.sender_id == user_a_id, Message.recipient_id == user_b_id),
                and_(Message.sender_id == user_b_id, Message.recipient_id == user_a_id),
            )
        )
        .order_by(Message.created_at)
        .all()
    )
