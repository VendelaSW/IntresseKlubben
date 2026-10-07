import { apiGet, apiPost, apiPut } from './api'

// Värdena måste matcha EventVisibility i backend/app/models/event.py.
export const EVENT_VISIBILITY = { open: 'open', inviteOnly: 'invite_only' }

// Kommande events man får se (öppna, ens egna, inbjudningar och klubbarnas),
// tidigast först. Passerade events döljs av backend.
export function getEvents() {
  return apiGet('/events/')
}

export function createEvent(data) {
  return apiPost('/events/', data)
}

// Värdena måste matcha EventAnswer i backend/app/models/event.py.
export const EVENT_ANSWER = { yes: 'yes', maybe: 'maybe', no: 'no' }

// Alla som har svarat, med sitt svar (och blocked_by_me om man själv har blockerat dem).
export function getEventResponses(eventId) {
  return apiGet(`/events/${eventId}/responses`)
}

// Sparar ens eget svar (ett nytt svar byter ut det gamla) och returnerar den
// uppdaterade listan över alla som har svarat.
export function answerEvent(eventId, answer) {
  return apiPut(`/events/${eventId}/response`, { answer })
}

// Bjuder in kontakter (usernames) och/eller alla medlemmar i klubbar (groupIds).
// Returnerar de som blev inbjudna den här gången.
export function inviteToEvent(eventId, { usernames = [], groupIds = [] }) {
  return apiPost(`/events/${eventId}/invitations`, { usernames, group_ids: groupIds })
}
