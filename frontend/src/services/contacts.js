import { apiDelete, apiGet, apiPatch, apiPost } from './api'

// Egna kontakter, inkommande och skickade förfrågningar.
export function getContacts() {
  return apiGet('/contacts')
}

export function sendContactRequest(addresseeUsername) {
  return apiPost('/contacts/request', { addressee_username: addresseeUsername })
}

// action är 'accept' eller 'reject'.
export function answerContactRequest(requestId, action) {
  return apiPatch(`/contacts/requests/${requestId}`, { action })
}

export function removeContact(contactId) {
  return apiDelete(`/contacts/${contactId}`)
}
