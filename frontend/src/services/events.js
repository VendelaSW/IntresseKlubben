import { apiGet, apiPost } from './api'

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
