import { apiDelete, apiGet, apiPatch, apiPost } from './api'

export function getContacts() {
  return apiGet('/contacts')
}

export function sendContactRequest(username) {
  return apiPost('/contacts/request', { addressee_username: username })
}

export function answerContactRequest(contactId, action) {
  return apiPatch(`/contacts/requests/${contactId}`, { action })
}

export function removeContact(contactId) {
  return apiDelete(`/contacts/${contactId}`)
}

export function blockUser(username) {
  return apiPost(`/users/${encodeURIComponent(username)}/block`)
}

export function unblockUser(username) {
  return apiDelete(`/users/${encodeURIComponent(username)}/block`)
}
