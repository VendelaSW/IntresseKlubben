import { useEffect, useRef, useState } from 'react'
import { EVENT_RANGES } from './activities'

// Knappen i kartans översta rad för hur långt fram events visas (se EVENT_RANGES): en ikon som de andra i raden, lika
// stor, med antalet dagar i en liten etikett i hörnet (1, 3, 7, 14 eller 30). Vad den gör står när man håller muspekaren över
// den. Ett klick fäller ut en lista under den med alla val; ett val, ett klick utanför eller Escape stänger den.
function MapEventRange({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = EVENT_RANGES.find((range) => range.id === value) ?? EVENT_RANGES[0]
  // Vad knappen gör, när man håller muspekaren över den (och för skärmläsare): "Visar events som börjar inom
  // 14 dagar. Klicka för att välja ett annat tidsspann."
  const span = current.id === 'idag' ? 'idag' : `inom ${current.label.replace(/^1 /, 'en ')}`
  const description = `Visar events som börjar ${span}. Klicka för att välja ett annat tidsspann.`

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="map-event-range" ref={rootRef}>
      <button
        type="button"
        className="map-tool map-tool-icon-only touch-target map-event-range-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={description}
        title={description}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <svg className="map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.2 6.2c5.2-.3 10.4-.3 15.6 0l-.2 13.6c-5 .3-10.1.3-15.2 0Z" />
          <path d="M4.3 10.4c5.1-.2 10.2-.2 15.4 0M8.4 3.6v4.2M15.6 3.6v4.2" />
        </svg>
        <span className="map-event-range-days" aria-hidden="true">
          {current.days}
        </span>
      </button>
      {open && (
        <ul className="map-event-range-menu" aria-label="Visa events som börjar inom">
          {EVENT_RANGES.map((range) => (
            <li key={range.id}>
              <button
                type="button"
                className={`map-event-range-option${range.id === current.id ? ' is-on' : ''}`}
                aria-pressed={range.id === current.id}
                onClick={() => {
                  onChange(range.id)
                  setOpen(false)
                }}
              >
                {range.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MapEventRange
