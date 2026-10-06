import { apiGet, apiPost } from './api'

// "Sett" per konversation: användarnamn → tidpunkt för senaste meddelandet
// man har sett. Tiderna kommer från servern (last_message_at/created_at),
// så en felställd klocka i webbläsaren påverkar inte. Sparas i webbläsaren,
// så på en annan enhet börjar det om. Riktig läst/oläst kräver ändring i
// backend.
const SEEN_KEY = 'intresseklubben.messagesSeen'

function readSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeSeen(seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // Går inte att spara: badgen kan då visas igen efter omladdning.
  }
}

function markSeen(username, timestamp) {
  writeSeen({ ...readSeen(), [username]: timestamp })
}

// Markerar en konversation som sedd fram till timestamp (t.ex. när nya brev
// visas i den öppna chatten).
export function markConversationSeen(username, timestamp) {
  markSeen(username, timestamp)
}

// Markerar alla konversationer i listan som sedda (t.ex. när man öppnar Meddelanden).
export function markConversationsSeen(conversations) {
  const seen = readSeen()
  for (const c of conversations) seen[c.username] = c.last_message_at
  writeSeen(seen)
}

// Antal konversationer med meddelanden som är nyare än det man senast såg.
export function countUnseenConversations(conversations) {
  const seen = readSeen()
  return conversations.filter(
    (c) => !seen[c.username] || new Date(c.last_message_at) > new Date(seen[c.username]),
  ).length
}

// Ens eget meddelande räknas som sett, så att det inte ger en badge.
export async function sendMessage(username, text) {
  const message = await apiPost('/messages', { recipient_username: username, text })
  markSeen(username, message.created_at)
  return message
}

export function getConversation(username) {
  return apiGet(`/messages/${encodeURIComponent(username)}`)
}

export function getConversations() {
  return apiGet('/messages')
}
