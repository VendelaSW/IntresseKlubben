import { Suspense, lazy, useState } from 'react'
import { searchPlaces } from '../services/geocode'

// Kartbiblioteket är stort, så kartan laddas först när formuläret visas.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'))

// Var på kartan något är, för events och klubbarnas träffplats: sök fram
// adressen och välj en träff, så hamnar en nål där. Nålen går sedan att dra,
// eller flyttas med ett klick på kartan, så att den står exakt rätt även när
// adressen är vag ("Badplatsen vid sjön").
//
// `query` är förslaget att söka på (t.ex. adressen och platsens namn), `value`
// är { latitude, longitude } eller null, och `onChange` får det nya värdet.
// Utan nål visas eventet eller klubben mitt i sin kommun på kartan.
function LocationPicker({ id, query, value, onChange }) {
  const [results, setResults] = useState(null) // null = inte sökt än
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function search() {
    const text = query.trim()
    if (text.length < 3) {
      setError('Skriv adressen eller platsens namn först.')
      return
    }
    setSearching(true)
    setError('')
    try {
      const places = await searchPlaces(text)
      setResults(places)
      // En enda träff: sätt nålen direkt.
      if (places.length === 1) onChange({ latitude: places[0].latitude, longitude: places[0].longitude })
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setSearching(false)
    }
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
      {results && results.length === 0 && (
        <p className="hint-text">Hittade inget. Sätt ut nålen själv genom att klicka på kartan.</p>
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
        <LocationPickerMap value={value} onChange={onChange} />
      </Suspense>
      <p className="hint-text">
        {value
          ? 'Dra nålen, eller klicka på kartan, om den inte står helt rätt.'
          : 'Ingen nål än: klicka på kartan, eller sök fram adressen. Utan nål visas den mitt i kommunen.'}
      </p>
    </div>
  )
}

export default LocationPicker
