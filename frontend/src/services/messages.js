import { apiGet, apiPost, apiPut } from './api'
import { SECOND, invalidate, queryClient } from './queryClient'

// Vilka brev man har läst sparas på kontot (PUT /messages/{id}/read), så att
// ett läst brev är läst i alla webbläsare och på alla enheter. Inkorgen
// (`unread` per konversation) och märket på Brev (unread_conversations i
// GET /users/me/badges) räknas på servern.

// Förut sparades "sett" i webbläsaren under den här nyckeln. Den används inte
// längre, så den städas bort.
try {
  localStorage.removeItem('intresseklubben.messagesSeen')
} catch {
  // Lagringen kan vara blockerad (t.ex. privat läge); då finns inget att städa.
}

// Skickas när en konversation har markerats som läst, så att märket räknas om
// direkt (se useBadgeCounts).
export const MESSAGES_READ = 'messages-read'

// Markerar konversationen med userId som läst fram till det senaste brevet
// (görs när man har den öppen, se ConversationPage). Inkorgen hämtas om, så
// att kuvertet inte längre står under Nya.
export async function markConversationRead(userId) {
  await apiPut(`/messages/${userId}/read`)
  invalidate(CONVERSATIONS_KEY)
  window.dispatchEvent(new Event(MESSAGES_READ))
}

// Det skickade brevet läggs direkt i den sparade konversationen, och listan
// på Brev hämtas om (det senaste brevet har ändrats). Ens egna brev är aldrig
// nya, så de ger inget märke.
export async function sendMessage(userId, text) {
  const message = await apiPost('/messages', { recipient_id: userId, text })
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
