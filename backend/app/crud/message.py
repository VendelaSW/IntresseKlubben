from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.profanity import censor_text
from app.models.message import Message


class CannotMessageSelfError(Exception):
    """Avsändare och mottagare är samma användare."""


def send_message(db: Session, sender_id: int, recipient_id: int, text: str) -> Message:
    if sender_id == recipient_id:
        raise CannotMessageSelfError(sender_id)

    message = Message(sender_id=sender_id, recipient_id=recipient_id, text=censor_text(text))
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
        # id som tiebreak: created_at har bara sekundupplösning i SQLite, så
        # två meddelanden i samma sekund (vanligt i tester) skulle annars
        # kunna hamna i oförutsägbar ordning.
        .order_by(Message.created_at, Message.id)
        .all()
    )


def list_conversations(db: Session, user_id: int) -> list[tuple[int, Message]]:
    """En rad per person användaren utbytt meddelanden med: den andras id
    och det senaste meddelandet dem emellan, nyast konversation först."""
    rows = (
        db.query(Message)
        .filter(or_(Message.sender_id == user_id, Message.recipient_id == user_id))
        .order_by(Message.created_at.desc(), Message.id.desc())
        .all()
    )
    seen = set()
    result = []
    for message in rows:
        other_id = message.recipient_id if message.sender_id == user_id else message.sender_id
        if other_id in seen:
            continue
        seen.add(other_id)
        result.append((other_id, message))
    return result
