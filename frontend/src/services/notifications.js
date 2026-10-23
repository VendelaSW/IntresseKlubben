import { apiDelete, apiGet, apiPost } from './api'
import { SECOND, invalidate, queryClient } from './queryClient'

// Notiser från Intresseklubben, t.ex. att ett event man skulle gå på har
// ställts in eller fått ny tid. Nyaste först (GET /notifications), var och en
// { title, body, quote, quote_by, link, created_at, read }. Olästa räknas i
// märket på lappen Notiser (unread_notifications, se useBadgeCounts).
export const NOTIFICATIONS_KEY = ['notifications']

export const notificationsQuery = {
  queryKey: NOTIFICATIONS_KEY,
  queryFn: () => apiGet('/notifications'),
  staleTime: 15 * SECOND,
}

// Skickas när notiserna har markerats som lästa, så att märket räknas om
// direkt (se useBadgeCounts).
export const NOTIFICATIONS_READ = 'notifications-read'

// Markerar en notis som läst (när man öppnar den, som ett brev). Den markeras
// direkt i listan i minnet, så att den inte längre står som ny när man går tillbaka.
export async function markNotificationRead(id) {
  queryClient.setQueryData(NOTIFICATIONS_KEY, (current) =>
    current?.map((n) => (n.id === id ? { ...n, read: true } : n)),
  )
  await apiPost(`/notifications/${id}/read`)
  window.dispatchEvent(new Event(NOTIFICATIONS_READ))
}

// Markerar alla notiser som lästa ("Markera alla som lästa").
export async function markNotificationsRead() {
  await apiPost('/notifications/read')
  invalidate(NOTIFICATIONS_KEY)
  window.dispatchEvent(new Event(NOTIFICATIONS_READ))
}

// Tar bort en notis. Den försvinner direkt ur listan i minnet.
export async function deleteNotification(id) {
  await apiDelete(`/notifications/${id}`)
  queryClient.setQueryData(NOTIFICATIONS_KEY, (current) => current?.filter((n) => n.id !== id))
  window.dispatchEvent(new Event(NOTIFICATIONS_READ))
}

// Tar bort alla ens notiser.
export async function deleteAllNotifications() {
  await apiDelete('/notifications')
  queryClient.setQueryData(NOTIFICATIONS_KEY, [])
  window.dispatchEvent(new Event(NOTIFICATIONS_READ))
}
