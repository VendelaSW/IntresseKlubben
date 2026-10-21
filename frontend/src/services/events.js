import { apiGet, apiPatch, apiPost, apiPut } from './api'
import { SECOND, invalidate, queryClient } from './queryClient'

// Värdena måste matcha EventVisibility i backend/app/models/event.py.
export const EVENT_VISIBILITY = { open: 'open', inviteOnly: 'invite_only' }

// Kommande events man får se (öppna, ens egna, inbjudningar och klubbarnas),
// tidigast först. Passerade events döljs av backend. Med groupId visas bara den
// klubbens events (man ser fortfarande bara de man får se).
export const EVENTS_KEY = ['events']

// Alla events (utan groupId) sparas i minnet en kort stund (se queryClient.js),
// så Events, kartan och att göra-läget delar samma hämtning. Allt nedan som ändrar
// ett event säger till minnet.
export const eventsQuery = {
  queryKey: EVENTS_KEY,
  queryFn: () => apiGet('/events/'),
  staleTime: 15 * SECOND,
}

export function getEvents(groupId) {
  return groupId ? apiGet(`/events/?group_id=${groupId}`) : queryClient.fetchQuery(eventsQuery)
}

// Kör ett anrop som ändrar ett event, och säger sedan till minnet.
async function changingEvents(request) {
  const result = await request
  invalidate(EVENTS_KEY)
  return result
}

export function createEvent(data) {
  return changingEvents(apiPost('/events/', data))
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
  return changingEvents(apiPut(`/events/${eventId}/response`, { answer }))
}

// Bjuder in kompisar (userIds) och/eller alla medlemmar i klubbar (groupIds).
// Returnerar de som blev inbjudna den här gången.
export function inviteToEvent(eventId, { userIds = [], groupIds = [] }) {
  return changingEvents(apiPost(`/events/${eventId}/invitations`, { user_ids: userIds, group_ids: groupIds }))
}

// Ändrar bara de fält som skickas, t.ex. { guests_can_invite: true }. Bara skaparen får.
export function updateEvent(eventId, changes) {
  return changingEvents(apiPatch(`/events/${eventId}`, changes))
}
