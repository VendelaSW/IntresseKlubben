import { apiDelete, apiGet, apiPost, apiPut } from './api'
import { SECOND, invalidate } from './queryClient'

// Moderering (SCRUM-131), bara för moderatorer (user.is_moderator). Se
// backend/app/api/routes/moderation.py.
export const MODERATION_KEY = ['moderation']

// Nya (handled = false) eller hanterade anmälningar, nyaste först.
export function moderationReportsQuery(handled) {
  return {
    queryKey: [...MODERATION_KEY, 'reports', handled],
    queryFn: () => apiGet(`/moderation/reports?handled=${handled}`),
    staleTime: 15 * SECOND,
  }
}

// Markerar en anmälan som hanterad, eller flyttar tillbaka den till de nya.
export async function setReportHandled(reportId, handled) {
  const path = `/moderation/reports/${reportId}/handled`
  await (handled ? apiPost(path) : apiDelete(path))
  invalidate(MODERATION_KEY)
}

// Hur länge man kan stänga av någon. Värdena måste matcha SUSPENSION_DAYS i
// backend/app/crud/moderation.py (null = tills vidare).
export const SUSPENSION_LENGTHS = [
  { days: 1, label: '1 dag' },
  { days: 7, label: '7 dagar' },
  { days: 30, label: '30 dagar' },
  { days: null, label: 'Tills vidare' },
]

// Det förvalda steget efter hur många gånger personen har varit avstängd förut:
// första gången 1 dag (7 dagar om hen redan har fått en varning, SCRUM-268, som
// då var första steget), andra gången 30 dagar, sedan tills vidare.
export function suggestedDays(previousCount, warningCount = 0) {
  if (previousCount === 0) return warningCount > 0 ? 7 : 1
  if (previousCount === 1) return 30
  return null
}

// Varnar den anmälda från en anmälan (SCRUM-268): personen får en notis om vilken
// regel som bröts, med det valfria meddelandet, och anmälan blir hanterad.
export async function warnUser(reportId, reason, message) {
  const result = await apiPost(`/moderation/reports/${reportId}/warning`, { reason, message })
  invalidate(MODERATION_KEY)
  return result
}

export async function suspendUser(userId, days, reason) {
  const result = await apiPut(`/moderation/users/${userId}/suspension`, { days, reason })
  invalidate(MODERATION_KEY)
  return result
}

export async function liftSuspension(userId) {
  await apiDelete(`/moderation/users/${userId}/suspension`)
  invalidate(MODERATION_KEY)
}
