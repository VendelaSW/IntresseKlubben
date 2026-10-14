import { apiGet, apiPost } from './api'
import { SECOND, invalidate, queryClient } from './queryClient'

// "Sett" per konversation: användarens id → tidpunkt för senaste meddelandet
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

function markSeen(userId, timestamp) {
  writeSeen({ ...readSeen(), [userId]: timestamp })
}

// Markerar en konversation som sedd fram till timestamp (t.ex. när nya brev
// visas i den öppna chatten).
export function markConversationSeen(userId, timestamp) {
  markSeen(userId, timestamp)
}

// Id:n för konversationerna med brev som är nyare än det man senast såg, dvs.
// nya brev som man inte har öppnat. Har man själv skrivit det senaste är det
// inget nytt brev, även om det skrevs på en annan enhet (där "sett" inte är
// sparat). En konversation räknas som sedd först när man öppnar den (se
// markConversationSeen i ConversationPage).
export function unseenConversationIds(conversations) {
  const seen = readSeen()
  return new Set(
    conversations
      .filter(
        (c) =>
          !c.last_message_from_me &&
          (!seen[c.id] || new Date(c.last_message_at) > new Date(seen[c.id])),
      )
      .map((c) => c.id),
  )
}

// Antal konversationer med nya brev, för siffran på brev-loggan.
export function countUnseenConversations(conversations) {
  return unseenConversationIds(conversations).size
}

// Ens eget meddelande räknas som sett, så att det inte ger en badge.
// Det skickade brevet läggs direkt i den sparade konversationen, och listan
// på Brev hämtas om (det senaste brevet har ändrats).
export async function sendMessage(userId, text) {
  const message = await apiPost('/messages', { recipient_id: userId, text })
  markSeen(userId, message.created_at)
  queryClient.setQueryData(conversationQuery(userId).queryKey, (current) =>
    current && !current.messages.some((m) => m.id === message.id)
      ? { ...current, messages: [...current.messages, message] }
      : current,
  )
  invalidate(CONVERSATIONS_KEY)
  return message
}

// { user, messages }: vem konversationen är med, och alla brev äldst först.
// Sparas i minnet (se queryClient.js), så en konversation man redan har haft
// öppen visas direkt när man kommer tillbaka.
export function conversationQuery(userId) {
  return { queryKey: ['conversation', String(userId)], queryFn: () => apiGet(`/messages/${userId}`), staleTime: 0 }
}

export function getConversation(userId) {
  return queryClient.fetchQuery(conversationQuery(userId))
}

// Alla konversationer, nyast först. Sparas i minnet en kort stund.
export const CONVERSATIONS_KEY = ['conversations']

export const conversationsQuery = {
  queryKey: CONVERSATIONS_KEY,
  queryFn: () => apiGet('/messages'),
  staleTime: 15 * SECOND,
}

export function getConversations() {
  return queryClient.fetchQuery(conversationsQuery)
}
