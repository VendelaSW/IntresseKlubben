import { apiDelete, apiGet, apiPatch, apiPost } from './api'

// Egna kontakter, inkommande och skickade förfrågningar.
export function getContacts() {
  return apiGet('/contacts')
}

export function sendContactRequest(userId) {
  return apiPost('/contacts/request', { addressee_id: userId })
}

// action är 'accept' eller 'reject'.
export function answerContactRequest(contactId, action) {
  return apiPatch(`/contacts/requests/${contactId}`, { action })
}

// Avsändaren ångrar en förfrågan som ännu inte besvarats.
export function cancelContactRequest(contactId) {
  return apiDelete(`/contacts/requests/${contactId}`)
}

export function removeContact(contactId) {
  return apiDelete(`/contacts/${contactId}`)
}

export function blockUser(userId) {
  return apiPost(`/users/${userId}/block`)
}

// De man själv har blockerat (aldrig de som blockerat en själv).
export function getBlockedUsers() {
  return apiGet('/users/blocked')
}

export function unblockUser(userId) {
  return apiDelete(`/users/${userId}/block`)
}
