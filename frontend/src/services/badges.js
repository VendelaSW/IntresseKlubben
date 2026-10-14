import { apiGet } from './api'

// Siffrorna för appens märken i ett anrop (GET /users/me/badges):
// { contact_requests, club_invitations, event_invitations, conversations },
// där conversations är [{ id, last_message_at, last_message_from_me }] för att
// räkna nya brev (se countUnseenConversations i messages.js).
export function getBadges() {
  return apiGet('/users/me/badges')
}
