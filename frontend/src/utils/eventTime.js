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

// Pågår eventet någon gång under dagen `day` (som ett <input type="date"> ger den, '' = alla dagar)? Ett event som
// började i går och slutar i dag finns alltså med i dag.
export function onDay(event, day) {
  if (!day) return true
  const [year, month, date] = day.split('-').map(Number)
  const dayStart = new Date(year, month - 1, date)
  const dayEnd = new Date(year, month - 1, date + 1)
  const start = new Date(event.starts_at)
  const end = event.ends_at ? new Date(event.ends_at) : start
  return start < dayEnd && end >= dayStart
}
