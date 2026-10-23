import { apiPost } from './api'

// Vad som anmäls. Värdena måste matcha ReportTarget i backend/app/models/report.py.
export const REPORT_TARGET = {
  profile: 'profile',
  message: 'message',
  groupMessage: 'group_message',
  groupPost: 'group_post',
}

// Anledningarna i den ordning de visas. Värdena måste matcha ReportReason i
// backend/app/models/report.py.
export const REPORT_REASONS = [
  { value: 'harassment', label: 'Trakasserier eller hot' },
  { value: 'inappropriate', label: 'Olämpligt eller sexuellt innehåll' },
  { value: 'spam', label: 'Spam eller bedrägeri' },
  { value: 'fake_profile', label: 'Falsk profil' },
  { value: 'other', label: 'Annat' },
]

// Anmäler en användare (targetId = användarens id) eller något hen har skrivit
// (id:t på brevet, chattmeddelandet eller lappen). Sparas för granskning.
export function sendReport({ targetType, targetId, reason, comment }) {
  return apiPost('/reports', { target_type: targetType, target_id: targetId, reason, comment: comment.trim() || null })
}
