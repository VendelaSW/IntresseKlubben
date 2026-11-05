import { useEffect, useId, useRef, useState } from 'react'

// Sök och filter bakom en sökikon (SCRUM-310), där man kan välja mellan att leta för hand och att skriva. Där
// skrivandet är själva uppgiften står sökfältet (SearchField) öppet i stället. Ikonen står till vänster, och ett tryck
// öppnar fälten bredvid den, med markören i sökfältet om det finns ett. `count` är hur många sökningar och filter som
// är på, och syns på ikonen också när fälten är stängda. `label` är ikonens namn för skärmläsare. Med `defaultOpen` är
// fälten öppna från början (t.ex. Matcha under Medlemmar), och ikonen stänger dem; markören flyttas då bara när man
// själv öppnar dem.
function SearchToggle({ count = 0, label = 'Sök och filtrera', defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const panelRef = useRef(null)
  const openedByDefault = useRef(defaultOpen)

  useEffect(() => {
    if (openedByDefault.current) {
      openedByDefault.current = false
      return
    }
    if (open) panelRef.current.querySelector('.search-field input')?.focus()
  }, [open])

  return (
    <div className="search-toggle-row">
      <button
        type="button"
        className={`search-toggle${open ? ' is-open' : ''}`}
        aria-label={count > 0 ? `${label}, ${count} på` : label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span className="search-toggle-count" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} ref={panelRef} className="search-toggle-panel">
          {children}
        </div>
      )}
    </div>
  )
}

export default SearchToggle
