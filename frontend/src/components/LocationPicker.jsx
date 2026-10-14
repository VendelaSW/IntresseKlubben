import { Suspense, lazy, useState } from 'react'
import { searchPlaces } from '../services/geocode'

// Kartbiblioteket är stort, så kartan laddas först när formuläret visas.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))

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
// det framgår när nålen sparas. Utan nål visas eventet eller klubben mitt i
// sin kommun på kartan.
function LocationPicker({ id, queries, value, onChange, saveLabel }) {
  const [results, setResults] = useState(null) // null = inte sökt än
  const [searched, setSearched] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const candidates = [...new Set(queries.map((q) => (q ?? '').trim()).filter((q) => q.length >= 3))]

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
      if (places.length === 1) onChange({ latitude: places[0].latitude, longitude: places[0].longitude })
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  // Sätts nålen för hand (klick eller drag) är sökträffarna inte längre aktuella.
  function placePin(position) {
    setResults(null)
    onChange(position)
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
          <button type="button" className="text-button" onClick={() => onChange(null)}>
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
                onClick={() => onChange({ latitude: place.latitude, longitude: place.longitude })}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Suspense fallback={<div className="location-picker-map" aria-hidden="true" />}>
        <LocationPickerMap value={value} onChange={placePin} />
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
