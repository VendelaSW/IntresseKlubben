"""
Siffrorna för appens märken (menyn och kartans lappar), i ett svar.

Nya brev räknas här på servern, utifrån vad användaren har läst (se
mark_conversation_read i crud/message.py), så att siffran är densamma på
alla enheter.
"""

from datetime import datetime

from pydantic import BaseModel


class ClubEventActivity(BaseModel):
    id: int
    created_at: datetime


class BadgeCounts(BaseModel):
    contact_requests: int  # obesvarade kontaktförfrågningar till mig
    club_invitations: int  # klubbar jag är inbjuden till och inte är med i
    event_invitations: int  # kommande events jag är inbjuden till och inte har svarat på
    unread_conversations: int  # konversationer med brev jag inte har läst
    unread_notifications: int  # notiser från Intresseklubben jag inte har läst (se routes/notifications.py)
    # Obesvarade kommande events i mina klubbar som jag varken skapat eller är
    # inbjuden till. Vilka som är nya sedan jag senast tittade på Events räknas
    # i webbläsaren (se frontend/src/services/eventsSeen.js), som breven.
    club_events: list[ClubEventActivity]
