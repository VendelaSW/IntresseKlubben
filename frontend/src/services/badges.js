import { apiGet } from './api'

// Siffrorna för appens märken i ett anrop (GET /users/me/badges):
// { contact_requests, club_invitations, event_invitations,
// unread_conversations, club_events }. Nya brev räknas på servern (se
// markConversationRead i messages.js).
export function getBadges() {
  return apiGet('/users/me/badges')
}
