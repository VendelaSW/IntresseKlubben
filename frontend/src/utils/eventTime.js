// Tidsfiltret på Events (SCRUM-215). Veckan börjar på måndag. Ett event räknas
// om det pågår någon gång under perioden, så ett event som började i går och
// slutar i dag finns med under Idag. Perioderna börjar vid dagens början, så att
// dagens events syns hela dagen.
export const TIME_FILTERS = [
  { id: '', label: 'Alla tider' },
  { id: 'today', label: 'Idag' },
  { id: 'weekend', label: 'I helgen' },
  { id: 'week', label: 'Denna vecka' },
]

const addDays = (day, days) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + days)

// [från, till) för filtret, räknat från `now`:
// - Idag: dagen ut.
// - I helgen: lördag och söndag den här veckan (är det helg nu: resten av helgen).
// - Denna vecka: från i dag till och med söndag.
export function timeRange(filter, now = new Date()) {
  const today = addDays(now, 0)
  const daysToSunday = (7 - now.getDay()) % 7 // getDay(): 0 = söndag
  const afterSunday = addDays(today, daysToSunday + 1)
  if (filter === 'today') return [today, addDays(today, 1)]
  if (filter === 'weekend') {
    const saturday = addDays(today, daysToSunday - 1)
    return [saturday > today ? saturday : today, afterSunday]
  }
  if (filter === 'week') return [today, afterSunday]
  return null
}

// Pågår eventet någon gång under filtrets period? Utan filter: alltid.
export function inTimeFilter(event, filter, now = new Date()) {
  const range = timeRange(filter, now)
  if (!range) return true
  const start = new Date(event.starts_at)
  const end = event.ends_at ? new Date(event.ends_at) : start
  return start < range[1] && end >= range[0]
}
