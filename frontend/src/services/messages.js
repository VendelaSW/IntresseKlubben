import { apiGet, apiPost } from './api'

export function sendMessage(username, text) {
  return apiPost('/messages', { recipient_username: username, text })
}

export function getConversation(username) {
  return apiGet(`/messages/${encodeURIComponent(username)}`)
}

export function getConversations() {
  return apiGet('/messages')
}
