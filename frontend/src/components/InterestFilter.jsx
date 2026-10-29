import { useEffect, useRef, useState } from 'react'
import { searchInterests } from '../services/interests'
import OptionPicker from './OptionPicker'

// Intressefiltret under Medlemmar > Sök. Två sätt att välja, och bara ett gäller åt gången:
//
//  - Rullistan innehåller bara ens egna intressen (`myInterests`), så att man filtrerar på det man själv har.
//  - Sökrutan söker bland hela biblioteket. Man väljer en träff och den visas som en tagg med ett kryss under filtren,
//    även när rullistan står på "Alla intressen". Ett nytt intresse går inte att lägga till härifrån (det görs på profilen).
//
// Sidan äger valet: `mineId` är rullistans val ('' = Alla intressen, alltså inget valt), `picked` är intresset från sökningen ({ id, name })
// eller null. `onPickMine(id)` och `onPick(interest | null)` anropas när man väljer, och sidan nollställer det andra.
// `paper` (TILLFÄLLIGT, testläget, Nicklas förslag 1): raden som papperslappar, och rullistan som en egen lista (OptionPicker) i
// stället för en <select>, som filterraden i Matcha-fliken. `children` (bara med `paper`) läggs i samma rad efter sökrutan, så att
// andra filter (kommun, kön, ålder) kan ligga på samma rad; taggen och sökträffarna ligger under raden.

// Samma väntan efter senaste tangenttrycket som i AddInterest, så att inte varje bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// Fler träffar än så får inte plats i filtret; man skriver mer för att begränsa dem.
const MAX_RESULTS = 8

const swedishOrder = new Intl.Collator('sv')

// Måste stämma med AddInterest (och backend).
const MAX_QUERY_LENGTH = 40

function InterestFilter({ myInterests, mineId, picked, onPickMine, onPick, paper = false, children }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ingen sökning, annars { text, items } för texten som söktes
  const [failed, setFailed] = useState(false)
  const searchRequest = useRef(0)

  // Sökningen, en kort stund efter senaste tangenttrycket. Ett svar på en äldre sökning kastas.
  useEffect(() => {
    const text = query.trim()
    setFailed(false)
    if (!text) {
      setResults(null)
      return undefined
    }
    const timer = setTimeout(() => {
      const request = ++searchRequest.current
      searchInterests(text)
        .then((items) => request === searchRequest.current && setResults({ text, items }))
        .catch(() => request === searchRequest.current && setFailed(true))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  function pick(interest) {
    setQuery('')
    setResults(null)
    onPick({ id: interest.id, name: interest.name })
  }

  const sortedMine = [...myInterests].sort((a, b) => swedishOrder.compare(a.name, b.name))
  // Träfflistan visas först när sökningen gäller texten som står i rutan, annars skulle man se träffar för något annat.
  const shown = results && results.text === query.trim() ? results : null

  return (
    <>
      <div className={`filter-select-row filter-select-row-compact${paper ? ' filter-select-row-paper' : ''}`}>
        {paper ? (
          <OptionPicker
            aria-label="Filtrera på ett av dina intressen"
            value={picked ? '' : mineId}
            onChange={onPickMine}
            options={[{ value: '', label: 'Dina intressen' }, ...sortedMine.map((interest) => ({ value: String(interest.id), label: interest.name }))]}
          />
        ) : (
          <select
            aria-label="Filtrera på ett av dina intressen"
            value={picked ? '' : mineId}
            onChange={(e) => onPickMine(e.target.value)}
          >
            <option value="">Alla intressen</option>
            {sortedMine.map((interest) => (
              <option key={interest.id} value={interest.id}>
                {interest.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          aria-label="Sök bland alla intressen"
          placeholder="Sök andra intressen"
          maxLength={MAX_QUERY_LENGTH}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {paper && children}
      </div>

      {picked && (
        <ul className="interest-tags">
          <li>
            <span className="interest-tag">
              {picked.name}
              <button
                type="button"
                className="interest-tag-remove"
                aria-label={`Ta bort filtret ${picked.name}`}
                onClick={() => onPick(null)}
              >
                ×
              </button>
            </span>
          </li>
        </ul>
      )}

      {failed && <p className="status-error">Sökningen misslyckades.</p>}

      {/* .explorer ger träfflistan samma utseende som i resten av appen; .filter-select-row-compact håller den lika
          smal som filtren. */}
      {shown && (
        <div className="explorer filter-select-row-compact" aria-live="polite">
          {shown.items.length === 0 ? (
            <p className="hint-text">Inga intressen matchar "{shown.text}".</p>
          ) : (
            <div className="explorer-box">
              <ul className="explorer-rows">
                {shown.items.slice(0, MAX_RESULTS).map((item) => (
                  <li key={item.id} className="explorer-row">
                    <span className="explorer-name">
                      {item.name}
                      <span className="hint-text">{item.path.length ? item.path.join(' › ') : 'Huvudområde'}</span>
                    </span>
                    <button type="button" className="secondary-button" onClick={() => pick(item)}>
                      Välj
                    </button>
                  </li>
                ))}
              </ul>
              {shown.items.length > MAX_RESULTS && <p className="hint-text">Skriv mer för att se färre träffar.</p>}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default InterestFilter
