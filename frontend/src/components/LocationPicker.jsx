import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { addressAt, searchPlaces } from '../services/geocode'

// Kartbiblioteket är stort, så kartan laddas först när formuläret visas.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))
// Medan nålen dras hämtas adressen högst så här ofta: Nominatim tar högst ett
// anrop i sekunden (se backend/app/services/geocoding.py).
const DRAG_LOOKUP_MS = 1000

// Var på kartan något är, för events och klubbarnas träffplats: sök fram
// adressen och välj en träff, så hamnar en nål där. Nålen går sedan att dra,
// eller flyttas med ett klick på kartan, så att den står exakt rätt även när
// adressen är vag ("Badplatsen vid sjön").
//
// `queries` är det som ska sökas på, i tur och ordning tills något hittas
// (t.ex. först adressen och sedan platsens namn, var för sig: ett eget namn
// som "Pokémonkyrkan" finns inte på kartan och skulle annars stjälpa
// sökningen). `value` är { latitude, longitude } eller null, `onChange` får
// det nya värdet, och `saveLabel` är formulärets knapp ("Skapa klubb"), så att
// det framgår när nålen sparas. `kommunCode` är kommunen kartan visar innan
// det finns en nål. Utan nål visas eventet eller klubben mitt i sin kommun på
// kartan.
//
// Nålen bestämmer adressen (SCRUM-241): varje gång nålen sätts eller flyttas får
// `onAddressFound(adress)` den närmaste gatuadressen, och formuläret skriver den i
// adressfältet. Medan nålen dras följer adressen med (en gång i sekunden), och när
// man släpper hämtas den för just där nålen hamnade. Nålen står kvar där man satte
// den. Bara det senaste svaret räknas, och går det inte att hitta någon adress
// händer ingenting: det är en hjälp, aldrig ett hinder.
function LocationPicker({ id, queries, value, onChange, saveLabel, kommunCode, onAddressFound }) {
  const [results, setResults] = useState(null) // null = inte sökt än
  const [searched, setSearched] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const candidates = [...new Set(queries.map((q) => (q ?? '').trim()).filter((q) => q.length >= 3))]
  // Räknas upp vid varje ny nål, så att ett sent svar för en gammal nål inte fyller i adressen.
  const lookup = useRef(0)
  const onAddressFoundRef = useRef(onAddressFound)
  onAddressFoundRef.current = onAddressFound
  // Medan nålen dras: den senaste positionen, en väntande sökning och när den förra gjordes.
  const dragPosition = useRef(null)
  const dragTimer = useRef(null)
  const lastDragLookup = useRef(0)

  useEffect(() => () => clearTimeout(dragTimer.current), [])

  // Under dragningen: högst en sökning per DRAG_LOOKUP_MS, alltid för där nålen är just då.
  function followDrag(position) {
    dragPosition.current = position
    if (dragTimer.current) return
    const wait = Math.max(0, lastDragLookup.current + DRAG_LOOKUP_MS - Date.now())
    dragTimer.current = setTimeout(() => {
      dragTimer.current = null
      lastDragLookup.current = Date.now()
      fillAddress(dragPosition.current)
    }, wait)
  }

  // Varje ny nål (klick, drag eller en träff i sökningen) hämtar adressen där den
  // står. "Ta bort nålen" lämnar adressen som den är.
  function setPin(position) {
    onChange(position)
    if (position) fillAddress(position)
    else lookup.current += 1
  }

  async function fillAddress(position) {
    const current = ++lookup.current
    if (!onAddressFoundRef.current) return
    try {
      const address = await addressAt(position.latitude, position.longitude)
      if (address && current === lookup.current) onAddressFoundRef.current?.(address)
    } catch {
      // Ingen adress: fältet lämnas som det är.
    }
  }

  async function search() {
    if (candidates.length === 0) {
      setError('Skriv adressen eller platsens namn först.')
      return
    }
    setSearching(true)
    setError('')
    try {
      let places = []
      for (const text of candidates) {
        places = await searchPlaces(text)
        if (places.length > 0) break
      }
      setResults(places)
      setSearched(candidates[0])
      // En enda träff: sätt nålen direkt.
      if (places.length === 1) setPin({ latitude: places[0].latitude, longitude: places[0].longitude })
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  // Sätts nålen för hand (klick, eller när man släpper den efter att ha dragit) är
  // sökträffarna inte längre aktuella. En väntande sökning från dragningen behövs inte:
  // nu hämtas adressen för där nålen hamnade.
  function placePin(position) {
    clearTimeout(dragTimer.current)
    dragTimer.current = null
    setResults(null)
    setPin(position)
  }

  return (
    <div className="location-picker" role="group" aria-labelledby={`${id}-label`}>
      <p id={`${id}-label`} className="location-picker-label">
        Var på kartan?
      </p>
      <div className="location-picker-actions">
        <button type="button" className="secondary-button button-small" onClick={search} disabled={searching}>
          {searching ? 'Söker...' : 'Hitta adressen på kartan'}
        </button>
        {value && (
          <button type="button" className="text-button" onClick={() => setPin(null)}>
            Ta bort nålen
          </button>
        )}
      </div>

      {error && <p className="status-error">{error}</p>}
      {results && results.length === 0 && !value && (
        <p className="hint-text">
          Hittade inte &quot;{searched}&quot; på kartan. Klicka på kartan där ni ska vara, så hamnar nålen där.
        </p>
      )}
      {results && results.length > 1 && (
        <ul className="location-picker-results">
          {results.map((place) => (
            <li key={`${place.latitude},${place.longitude}`}>
              <button
                type="button"
                className="text-button"
                onClick={() => setPin({ latitude: place.latitude, longitude: place.longitude })}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Suspense fallback={<div className="location-picker-map" aria-hidden="true" />}>
        <LocationPickerMap value={value} onChange={placePin} onDrag={followDrag} kommunCode={kommunCode} />
      </Suspense>
      <p className="hint-text">
        {value
          ? `Nålen är satt och sparas när du trycker "${saveLabel}". Dra den, eller klicka på kartan, om den inte står helt rätt.`
          : 'Ingen nål än: klicka på kartan, eller sök fram adressen. Utan nål visas den mitt i kommunen.'}
      </p>
    </div>
  )
}

export default LocationPicker
