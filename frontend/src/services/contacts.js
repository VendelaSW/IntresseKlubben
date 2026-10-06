import { apiDelete, apiGet, apiPatch, apiPost } from './api'

// Egna kontakter, inkommande och skickade förfrågningar.
export function getContacts() {
  return apiGet('/contacts')
}

export function sendContactRequest(username) {
  return apiPost('/contacts/request', { addressee_username: username })
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

export function blockUser(username) {
  return apiPost(`/users/${encodeURIComponent(username)}/block`)
}

// De man själv har blockerat (aldrig de som blockerat en själv).
export function getBlockedUsers() {
  return apiGet('/users/blocked')
}

export function unblockUser(username) {
  return apiDelete(`/users/${encodeURIComponent(username)}/block`)
}
