"""
Siffrorna för appens märken.

GET /users/me/badges - kontaktförfrågningar, klubbinbjudningar och
  eventinbjudningar att svara på, plus det som behövs för att räkna nya brev
  (se schemas/badges.py). Frontend räknar om dem ofta (var 30:e sekund och vid
  sidbyte), så allt kommer i ett anrop i stället för fyra listor. Siffrorna
  räknas med samma regler som listorna på Personer, Klubbar, Events och Brev.

Låst tills profilen är klar (se require_profile), som listorna.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_profile
from app.crud.contact import blocked_user_ids, incoming_request_count
from app.crud.event import unanswered_invitation_count
from app.crud.group import invitation_count
from app.crud.message import list_conversations
from app.db.session import get_db
from app.models.user import User
from app.schemas.badges import BadgeCounts, ConversationActivity

router = APIRouter(prefix="/users", tags=["badges"], dependencies=[Depends(require_profile)])


@router.get("/me/badges", response_model=BadgeCounts)
def read_my_badges(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> BadgeCounts:
    user_id = current_user.id
    # Varje fråga är en resa till databasen, så blockeringarna hämtas en gång
    # och de tre räkningarna ställs i samma fråga.
    hidden = blocked_user_ids(db, user_id)
    requests, clubs, events = db.execute(
        select(
            incoming_request_count(user_id).scalar_subquery(),
            invitation_count(user_id).scalar_subquery(),
            unanswered_invitation_count(db, user_id, hidden).scalar_subquery(),
        )
    ).one()
    return BadgeCounts(
        contact_requests=requests,
        club_invitations=clubs,
        event_invitations=events,
        conversations=[
            ConversationActivity(
                id=other_id,
                last_message_at=message.created_at,
                last_message_from_me=message.sender_id == user_id,
            )
            for other_id, message in list_conversations(db, user_id, hidden)
        ],
    )
