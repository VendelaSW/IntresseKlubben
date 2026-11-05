import { useEffect, useRef, useState } from 'react'
import { EVENT_RANGES } from './activities'

// Knappen i kartans översta rad för hur långt fram events visas (se EVENT_RANGES): en kalender och det valda
// ("14 dagar"). Ett klick var som helst på knappen fäller ut en lista under den med alla val; ett val, ett klick
// utanför eller Escape stänger den. Knappen är lika bred som det längsta valet, så att raden (och sökrutan under, som
// är lika bred) inte hoppar när man byter. På smala skärmar syns bara kalendern (se map.css), och valet står i title.
function MapEventRange({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = EVENT_RANGES.find((range) => range.id === value) ?? EVENT_RANGES[0]

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
        className="map-tool touch-target map-event-range-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Events på kartan: ${current.label}`}
        title={`Events på kartan: ${current.label}`}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <svg className="map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.2 6.2c5.2-.3 10.4-.3 15.6 0l-.2 13.6c-5 .3-10.1.3-15.2 0Z" />
          <path d="M4.3 10.4c5.1-.2 10.2-.2 15.4 0M8.4 3.6v4.2M15.6 3.6v4.2" />
        </svg>
        {/* Alla val ligger på samma plats, men bara det valda syns: då är knappen lika bred som det längsta. */}
        <span className="map-event-range-label" aria-hidden="true">
          {EVENT_RANGES.map((range) => (
            <span key={range.id} className={range.id === current.id ? 'is-current' : undefined}>
              {range.label}
            </span>
          ))}
        </span>
        <svg className="map-event-range-chevron" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" />
        </svg>
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
