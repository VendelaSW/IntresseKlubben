"""
Endpoints för meddelanden mellan användare.

POST /messages - skickar ett meddelande. Avsändaren är alltid den
inloggade användaren (current_user), aldrig något som skickas med i
request-bodyn. Mottagaren anges med username (se MessageCreate),
eftersom frontend bara känner till den andras username, inte id.

GET /messages/{username} - hela konversationen med en specifik
användare, båda riktningarna, kronologiskt sorterad.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.crud.contact import is_blocked
from app.crud.message import CannotMessageSelfError, get_conversation, send_message
from app.crud.user import get_user_by_username
from app.db.session import get_db
from app.models.user import User
from app.schemas.message import MessageCreate, MessageOut

router = APIRouter(prefix="/messages", tags=["messages"])


def _reachable_user_or_404(db: Session, current_user_id: int, username: str) -> User:
    user = get_user_by_username(db, username)
    # Samma neutrala fel om användaren inte finns eller om någon av de två
    # har blockerat den andra - annars avslöjar svaret att en blockering
    # finns, vilket är precis det en blockering ska dölja.
    if user is None or is_blocked(db, current_user_id, user.id):
        raise HTTPException(status_code=404, detail="Användaren finns inte")
    return user


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def create_message(
    message_in: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    recipient = _reachable_user_or_404(db, current_user.id, message_in.recipient_username)
    try:
        return send_message(db, current_user.id, recipient.id, message_in.text)
    except CannotMessageSelfError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du kan inte skicka ett meddelande till dig själv.",
        )


@router.get("/{username}", response_model=list[MessageOut])
def read_conversation(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageOut]:
    other = _reachable_user_or_404(db, current_user.id, username)
    return get_conversation(db, current_user.id, other.id)
