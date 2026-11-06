import { useRef, useState } from 'react'
import DateField from '../../shared/DateField'
import { DAY_FILTERS, latestEventTime, localDateValue } from '../../utils/eventTime'

// Värdet för "Välj datum…" i listan. Väljs aldrig som filter, utan öppnar kalendern.
const PICK_DAY = 'valj-datum'

const dayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })

// Datumfiltret under Events (SCRUM-313): en lista med Alla datum, Idag, I helgen och Denna vecka, och sist "Välj
// datum…", som öppnar webbläsarens kalender (från i dag till ett år framåt, som DateField). En vald dag står sedan i
// listan ("lör 7 nov."). `value` är snabbvalets id eller dagen ('2026-11-07'), '' = alla datum (se dayRange i
// utils/eventTime.js), och `onChange` får det nya.
function EventDayFilter({ value, onChange }) {
  const calendarRef = useRef(null)
  // Kan webbläsaren inte öppna kalendern härifrån (showPicker saknas, t.ex. en äldre Safari) visas datumfältet i
  // stället för listan, tills man har valt en dag.
  const [typing, setTyping] = useState(false)
  const day = value && !DAY_FILTERS.some((f) => f.id === value) ? value : ''
  const now = new Date()

  function choose(next) {
    if (next !== PICK_DAY) {
      onChange(next)
      return
    }
    try {
      calendarRef.current.showPicker()
    } catch {
      setTyping(true)
    }
  }

  function chooseDay(next) {
    setTyping(false)
    if (next) onChange(next)
  }

  if (typing) {
    return <DateField aria-label="Filtrera på datum" emptyLabel="Alla datum" value={day} onChange={chooseDay} />
  }

  const [year, month, date] = day.split('-').map(Number)
  return (
    <div className="event-day-filter">
      <select aria-label="Filtrera på datum" value={value} onChange={(e) => choose(e.target.value)}>
        {DAY_FILTERS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
        {day && <option value={day}>{dayFormat.format(new Date(year, month - 1, date))}</option>}
        <option value={PICK_DAY}>Välj datum…</option>
      </select>
      {/* Kalendern som "Välj datum…" öppnar. Osynlig, och ligger under listan så att kalendern öppnas där. */}
      <input
        ref={calendarRef}
        type="date"
        className="event-day-filter-calendar"
        tabIndex={-1}
        aria-hidden="true"
        value={day}
        min={localDateValue(now)}
        max={localDateValue(latestEventTime(now))}
        onChange={(e) => chooseDay(e.target.value)}
      />
    </div>
  )
}

export default EventDayFilter
