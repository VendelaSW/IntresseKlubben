import { useRef } from 'react'
import { latestEventTime, localDateValue, localInputValue } from '../utils/eventTime'

// Datumfältet för events (SCRUM-313), i Skapa event (med tid, `withTime`) och i filtret under Events (bara datum).
// Kalendern går bara att välja i från nu till ett år framåt (se EVENT_MAX_DAYS_AHEAD), samma gräns som backend.
// `min` kan sättas till något annat (t.ex. starten för sluttiden) eller till null, för ingen undre gräns (en
// oförändrad start på ett event som redan har börjat). Fungerar som ett vanligt fält: `value` är fältets text
// ('2026-11-07' eller '2026-11-07T17:00', '' = inget) och `onChange` får den nya.
// `emptyLabel` (t.ex. "Alla datum" i ett filter) står i fältet när inget är valt, och då kan valet tas bort med ett
// kryss.
function DateField({
  id,
  value,
  onChange,
  withTime = false,
  min,
  emptyLabel = null,
  required = false,
  'aria-label': ariaLabel,
}) {
  const inputRef = useRef(null)
  const toValue = withTime ? localInputValue : localDateValue
  const now = new Date()

  // Krysset försvinner när valet är borttaget, så fokus flyttas till fältet i stället för att tappas.
  function clear() {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={`date-field${!emptyLabel ? '' : value ? ' is-set' : ' is-empty'}`}>
      <input
        ref={inputRef}
        id={id}
        type={withTime ? 'datetime-local' : 'date'}
        aria-label={ariaLabel}
        value={value}
        min={min === undefined ? toValue(now) : (min ?? undefined)}
        max={toValue(latestEventTime(now))}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      {emptyLabel && !value && (
        <span className="date-field-empty" aria-hidden="true">
          {emptyLabel}
        </span>
      )}
      {emptyLabel && value && (
        <button type="button" className="field-clear" aria-label="Ta bort datumet" onClick={clear}>
          ×
        </button>
      )}
    </div>
  )
}

export default DateField
