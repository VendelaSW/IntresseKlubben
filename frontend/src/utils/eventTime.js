// Tider för events: hur långt fram ett event kan ligga, och datumfiltret på Events.

// Ett event kan ligga högst så här många dagar fram (SCRUM-313). Samma gräns som EVENT_MAX_DAYS_AHEAD i backend
// (app/schemas/event.py), som nekar events utanför den.
export const EVENT_MAX_DAYS_AHEAD = 365

const pad = (n) => String(n).padStart(2, '0')

// Värdet ett <input type="date"> vill ha: lokalt datum (2026-11-07).
export function localDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Värdet ett <input type="datetime-local"> vill ha: lokal tid utan tidszon (2026-11-07T17:00).
export function localInputValue(date) {
  return `${localDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Den senaste tid ett event kan ligga på, räknat från `now`, som i backend.
export function latestEventTime(now = new Date()) {
  return new Date(now.getTime() + EVENT_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000)
}

// Datumfiltret på Events (SCRUM-215, SCRUM-313): snabbvalen, eller en dag man valt i kalendern ('2026-11-07'). Veckan
// börjar på måndag. Ett event räknas om det pågår någon gång under perioden, så ett event som började i går och slutar
// i dag finns med under Idag. Perioderna börjar vid dagens början, så att dagens events syns hela dagen.
export const DAY_FILTERS = [
  { id: '', label: 'Alla datum' },
  { id: 'today', label: 'Idag' },
  { id: 'weekend', label: 'I helgen' },
  { id: 'week', label: 'Denna vecka' },
]

const addDays = (day, days) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + days)

// [från, till) för filtret, räknat från `now`, eller null för alla datum:
// - Idag: dagen ut.
// - I helgen: lördag och söndag den här veckan (är det helg nu: resten av helgen).
// - Denna vecka: från i dag till och med söndag.
// - En vald dag: hela den dagen.
export function dayRange(filter, now = new Date()) {
  const today = addDays(now, 0)
  const daysToSunday = (7 - now.getDay()) % 7 // getDay(): 0 = söndag
  const afterSunday = addDays(today, daysToSunday + 1)
  if (filter === 'today') return [today, addDays(today, 1)]
  if (filter === 'weekend') {
    const saturday = addDays(today, daysToSunday - 1)
    return [saturday > today ? saturday : today, afterSunday]
  }
  if (filter === 'week') return [today, afterSunday]
  if (!filter) return null
  const [year, month, date] = filter.split('-').map(Number)
  const day = new Date(year, month - 1, date)
  return [day, addDays(day, 1)]
}

// Pågår eventet någon gång under filtrets period? Utan filter: alltid.
export function inDayFilter(event, filter, now = new Date()) {
  const range = dayRange(filter, now)
  if (!range) return true
  const start = new Date(event.starts_at)
  const end = event.ends_at ? new Date(event.ends_at) : start
  return start < range[1] && end >= range[0]
}
