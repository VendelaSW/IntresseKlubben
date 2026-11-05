import { useLayoutEffect, useRef } from 'react'
import { useDismiss } from '../hooks/useDismiss'

// Två små kvadratiska ikonknappar, t.ex. till höger om adressfältet: en nål som
// söker fram adressen på kartan och sätter nålen ("Hitta på kartan", se
// useLocationPicker), och ett kryss som tar bort nålen när den är satt. Finns det
// flera träffar visas de i en lista under knappen, som en rullgardin med egen
// scroll, och ett val sätter nålen där. Listan, och "hittade inte" eller ett fel,
// ligger ovanpå formuläret (popover), så att inget annat flyttar sig. Den stängs
// när man väljer, trycker utanför, trycker Esc (bara listan) eller scrollar.
function LocationSearch({ picker }) {
  const { results, searched, searching, error, value, search, choose, closeResults, removePin } = picker
  const ref = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const notFound = results && results.length === 0 && !value
  const open = Boolean(error || notFound || (results && results.length > 1))

  useDismiss(ref, open, closeResults)

  // Under knappen och inom fönstret.
  useLayoutEffect(() => {
    if (!open) return undefined
    const list = listRef.current
    list.showPopover?.()
    const button = buttonRef.current.getBoundingClientRect()
    const margin = 8
    const { width } = list.getBoundingClientRect()
    // I ett formulär som är krympt (zoom, se useFitToHeight) räknas top och left i listans egna, krympta mått.
    const zoom = list.currentCSSZoom ?? 1
    list.style.top = `${(button.bottom + 4) / zoom}px`
    list.style.left = `${Math.max(margin, Math.min(button.left, window.innerWidth - width - margin)) / zoom}px`
    // Listan står still medan sidan rör sig, så den stängs när sidan scrollar (men inte när listan själv gör det).
    const onScroll = (event) => !list.contains(event.target) && closeResults()
    // Esc stänger bara listan, inte blocket eller popupen runt formuläret: i capture, så att den hinner först.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      closeResults()
    }
    window.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, closeResults])

  return (
    <div className="location-search" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-square-button"
        onClick={search}
        disabled={searching}
        aria-label={searching ? 'Söker på kartan...' : 'Hitta på kartan'}
        title="Hitta på kartan"
      >
        {/* En kartnål. */}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 21.5s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5-6.5 11.2-6.5 11.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10.3" r="2.4" fill="currentColor" />
        </svg>
      </button>
      {value && (
        <button type="button" className="icon-square-button" onClick={removePin} aria-label="Ta bort nålen" title="Ta bort nålen">
          {/* Ett kryss. */}
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {open && (
        <div ref={listRef} className="location-search-list" popover="manual">
          {error ? (
            <p className="status-error">{error}</p>
          ) : notFound ? (
            <p className="hint-text">
              Hittade inte &quot;{searched}&quot; på kartan. Klicka på kartan där ni ska vara, så hamnar nålen där.
            </p>
          ) : (
            <ul>
              {results.map((place) => (
                <li key={`${place.latitude},${place.longitude}`}>
                  <button type="button" className="location-search-option" onClick={() => choose(place)}>
                    {place.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default LocationSearch
