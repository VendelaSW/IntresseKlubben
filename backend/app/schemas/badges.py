"""
Siffrorna för appens märken (menyn och kartans lappar), i ett svar.

conversations är bara det som behövs för att räkna nya brev: vem
konversationen är med och när och av vem det senaste brevet skrevs. Vilka
brev man redan har sett sparas i webbläsaren (se frontend/src/services/
messages.js), så räkningen görs där.
"""

from datetime import datetime

from pydantic import BaseModel


class ConversationActivity(BaseModel):
    id: int  # den andra personens id, som i ConversationResponse
    last_message_at: datetime
    last_message_from_me: bool


class ClubEventActivity(BaseModel):
    id: int
    created_at: datetime


class BadgeCounts(BaseModel):
    contact_requests: int  # obesvarade kontaktförfrågningar till mig
    club_invitations: int  # klubbar jag är inbjuden till och inte är med i
    event_invitations: int  # kommande events jag är inbjuden till och inte har svarat på
    conversations: list[ConversationActivity]
    # Obesvarade kommande events i mina klubbar som jag varken skapat eller är
    # inbjuden till. Vilka som är nya sedan jag senast tittade på Events räknas
    # i webbläsaren (se frontend/src/services/eventsSeen.js), som breven.
    club_events: list[ClubEventActivity]
