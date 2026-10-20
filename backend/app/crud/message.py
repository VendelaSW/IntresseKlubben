from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from app.core.profanity import censor_text
from app.crud.contact import blocked_user_ids
from app.models.conversation_read import ConversationRead
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


def list_conversations(db: Session, user_id: int, hidden: set[int] | None = None) -> list[tuple[int, Message]]:
    """En rad per person användaren utbytt meddelanden med: den andras id
    och det senaste meddelandet dem emellan, nyast konversation först.
    Konversationer med någon som har blockerat användaren, eller som
    användaren har blockerat, kommer inte med (`hidden` är blocked_user_ids,
    om anroparen redan har hämtat dem).

    Det senaste meddelandet per person väljs i databasen (row_number per
    person), så bara en rad per konversation hämtas, inte hela historiken.
    Listan hämtas ofta (siffran på Brev räknas om var 30:e sekund)."""
    other_id = case((Message.sender_id == user_id, Message.recipient_id), else_=Message.sender_id)
    newest_first = (Message.created_at.desc(), Message.id.desc())
    ranked = (
        db.query(
            Message.id.label("id"),
            other_id.label("other_id"),
            func.row_number().over(partition_by=other_id, order_by=newest_first).label("place"),
        )
        .filter(or_(Message.sender_id == user_id, Message.recipient_id == user_id))
        .subquery()
    )
    rows = (
        db.query(ranked.c.other_id, Message)
        .join(Message, Message.id == ranked.c.id)
        .filter(ranked.c.place == 1)
        .order_by(*newest_first)
        .all()
    )
    if hidden is None:
        hidden = blocked_user_ids(db, user_id)
    return [(other, message) for other, message in rows if other not in hidden]


# ---------- Lästa brev ----------


def mark_conversation_read(db: Session, user_id: int, other_id: int) -> None:
    """Markerar konversationen med other_id som läst fram till det senaste
    brevet. Går att upprepa, och flyttar aldrig tillbaka (ett äldre svar från
    en långsam enhet gör inte ett nyare brev oläst igen)."""
    newest = (
        db.query(func.max(Message.id))
        .filter(
            or_(
                and_(Message.sender_id == user_id, Message.recipient_id == other_id),
                and_(Message.sender_id == other_id, Message.recipient_id == user_id),
            )
        )
        .scalar()
    )
    if newest is None:
        return
    read = db.get(ConversationRead, (user_id, other_id))
    if read is None:
        db.add(ConversationRead(user_id=user_id, other_user_id=other_id, last_read_message_id=newest))
    elif newest > read.last_read_message_id:
        read.last_read_message_id = newest
    else:
        return
    db.commit()


def last_read_ids(db: Session, user_id: int) -> dict[int, int]:
    """{den andras id: id:t på senaste lästa brevet} för användarens konversationer."""
    rows = db.query(ConversationRead.other_user_id, ConversationRead.last_read_message_id).filter(
        ConversationRead.user_id == user_id
    )
    return dict(rows.all())


def is_unread(last_message: Message, user_id: int, read_ids: dict[int, int], other_id: int) -> bool:
    """Har den andra skrivit något som användaren inte har läst? Ens egna brev
    är aldrig nya."""
    if last_message.sender_id == user_id:
        return False
    return last_message.id > read_ids.get(other_id, 0)
