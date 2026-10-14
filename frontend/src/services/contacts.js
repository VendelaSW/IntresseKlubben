import { apiDelete, apiGet, apiPatch, apiPost } from './api'
import { SECOND, invalidate, queryClient } from './queryClient'

export const CONTACTS_KEY = ['contacts']

// Sparas i minnet en kort stund (se queryClient.js), så Personer, Events,
// Klubbar och profilsidorna delar samma hämtning.
export const contactsQuery = {
  queryKey: CONTACTS_KEY,
  queryFn: () => apiGet('/contacts'),
  staleTime: 15 * SECOND,
}

// Kör ett anrop som ändrar en kontakt, och säger sedan till minnet.
async function changingContacts(request) {
  const result = await request
  invalidate(CONTACTS_KEY)
  return result
}

// En blockering döljer personer överallt (personer, brev, events, klubbar),
// så allt i minnet hämtas om.
async function changingBlocks(request) {
  const result = await request
  queryClient.invalidateQueries()
  return result
}

// Egna kontakter, inkommande och skickade förfrågningar.
export function getContacts() {
  return queryClient.fetchQuery(contactsQuery)
}

export function sendContactRequest(userId) {
  return changingContacts(apiPost('/contacts/request', { addressee_id: userId }))
}

// action är 'accept' eller 'reject'.
export function answerContactRequest(contactId, action) {
  return changingContacts(apiPatch(`/contacts/requests/${contactId}`, { action }))
}

// Avsändaren ångrar en förfrågan som ännu inte besvarats.
export function cancelContactRequest(contactId) {
  return changingContacts(apiDelete(`/contacts/requests/${contactId}`))
}

export function removeContact(contactId) {
  return changingContacts(apiDelete(`/contacts/${contactId}`))
}

export function blockUser(userId) {
  return changingBlocks(apiPost(`/users/${userId}/block`))
}

// De man själv har blockerat (aldrig de som blockerat en själv).
export function getBlockedUsers() {
  return apiGet('/users/blocked')
}

export function unblockUser(userId) {
  return changingBlocks(apiDelete(`/users/${userId}/block`))
}
