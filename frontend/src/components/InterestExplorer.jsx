import { useEffect, useRef, useState } from 'react'
import { DidYouMean, MAX_INTEREST_LENGTH, NewInterestOffer } from './AddInterest'
import InterestLibrary, { PickTag } from './InterestLibrary'
import InterestTree, { profileTree } from './InterestTree'
import { searchInterests } from '../services/interests'

// Så länge sökningen väntar efter senaste tangenttrycket, så att inte varje
// bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// "Vad gillar du?": de valda intressena, en sökruta för att lägga till fler och
// Intressebiblioteket (InterestLibrary) att leta runt i. Biblioteket är ett träd
// (huvudområde › intresse › mer specifikt), och varje nivå går att välja, även
// huvudområdet självt.
//
// Komponenten sparar inget själv: `onAdd(interest)` och `onRemove(interest)`
// gör det (direkt på profilen, eller i formuläret när profilen skapas). De får
// returnera ett promise; misslyckas det visas felet här. `selected` är de valda
// intressena ({ id, name, parent_id, path, area }, eller { id, name, path } från
// sökningen och biblioteket när profilen skapas), som visas som taggar
// (InterestTree, se utils/interestGroups.js). Med `onAddNew(result)` erbjuds man
// att lägga till ett intresse som inte finns när sökningen inte ger någon träff
// (se AddInterest.jsx); utan den visas bara att inget matchar.
//
// `mode`:
// - 'card' (profilen): ett eget vitt kort med intressena, sökrutan direkt och en
//   knapp som öppnar biblioteket (`onOpenLibrary`). Kryss på taggarna bara efter
//   "Redigera", så att man inte råkar ta bort ett intresse.
// - 'library': Intressebiblioteket över hela blocket, med sökrutan och alla områden.
// - 'form' (när profilen skapas): allt direkt i formuläret, eftersom man måste
//   välja minst ett intresse där. Taggarna har alltid kryss.
function InterestExplorer({ selected, onAdd, onRemove, onAddNew, mode = 'card', onOpenLibrary }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ingen sökning
  const [resultsFor, setResultsFor] = useState('') // texten som träfflistan gäller
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const removable = mode === 'form' || editing
  const searchRequest = useRef(0)

  // Sökningen, en kort stund efter senaste tangenttrycket. Ett svar på en
  // äldre sökning (som man hunnit skriva vidare på) kastas.
  useEffect(() => {
    const text = query.trim()
    if (!text) {
      setResults(null)
      return undefined
    }
    const timer = setTimeout(() => {
      const request = ++searchRequest.current
      searchInterests(text)
        .then((items) => {
          if (request !== searchRequest.current) return
          setResults(items)
          setResultsFor(text)
        })
        .catch(() => request === searchRequest.current && setError('Sökningen misslyckades.'))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  const selectedIds = new Set(selected.map((i) => i.id))

  async function toggle(interest) {
    setBusyId(interest.id)
    setError('')
    try {
      if (selectedIds.has(interest.id)) await onRemove(interest)
      else await onAdd(interest)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  // Knappen vid "Menade du" (en rad med namnet bredvid, se AddInterest.jsx).
  function addButton(interest) {
    const isSelected = selectedIds.has(interest.id)
    return (
      <button
        type="button"
        className={`explorer-add${isSelected ? ' explorer-add-on' : ''}`}
        aria-label={isSelected ? `Ta bort ${interest.name}` : `Lägg till ${interest.name}`}
        aria-pressed={isSelected}
        disabled={busyId === interest.id}
        onClick={() => toggle(interest)}
      >
        {isSelected ? '✓' : '+'}
      </button>
    )
  }

  const search = (
    <>
      <input
        type="search"
        className="explorer-search"
        aria-label="Lägg till ett intresse"
        placeholder={mode === 'library' ? 'Sök bland alla intressen' : 'Lägg till ett intresse, t.ex. "foto"'}
        maxLength={MAX_INTEREST_LENGTH}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results && (
        <div className="explorer-box">
          {results.length === 0 ? (
            onAddNew ? (
              // Först när träfflistan gäller texten som står i rutan, annars skulle man kunna lägga till något som har träffar.
              resultsFor === query.trim() && (
                <NewInterestOffer
                  text={resultsFor}
                  onAddNew={onAddNew}
                  onDone={() => setQuery('')}
                  boxed={false}
                  similarAction={addButton}
                />
              )
            ) : (
              <>
                <p className="hint-text">Inget intresse matchar "{query.trim()}" än.</p>
                {resultsFor === query.trim() && <DidYouMean text={resultsFor} action={addButton} />}
              </>
            )
          ) : (
            // Träffarna som taggar att trycka på. Var de hör hemma (t.ex. "Sport och träning › Löpning") syns när
            // man håller över dem, och i färgen.
            <ul className="interest-tags">
              {results.map((item) => (
                <PickTag
                  key={item.id}
                  interest={item}
                  area={item.path[0] ?? item.name}
                  title={[...item.path, item.name].join(' › ')}
                  on={selectedIds.has(item.id)}
                  busy={busyId === item.id}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )

  const mine = (
    <div className="explorer-section">
      <div className="explorer-heading-row">
        <h3 className="explorer-heading">Dina intressen ({selected.length})</h3>
        {mode === 'card' && selected.length > 0 && (
          <button type="button" className="text-button" aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? 'Klar' : 'Redigera'}
          </button>
        )}
      </div>
      {mode === 'card' && editing && <p className="hint-text">Tryck på × för att ta bort ett intresse.</p>}
      {selected.length === 0 ? (
        <p className="hint-text">Inga intressen än.</p>
      ) : (
        <InterestTree
          proposals={profileTree(selected)}
          align="start"
          busyKey={busyId === null ? null : `id:${busyId}`}
          onRemove={removable ? (key) => toggle(selected.find((i) => `id:${i.id}` === key)) : undefined}
        />
      )}
    </div>
  )

  const errorText = error && <p className="form-error">{error}</p>
  const library = (
    <div className="explorer-section">
      <h3 className="explorer-heading">{mode === 'library' ? 'Områden' : 'Utforska'}</h3>
      <InterestLibrary selectedIds={selectedIds} busyId={busyId} onToggle={toggle} onError={setError} />
    </div>
  )

  if (mode === 'library') {
    return (
      <section className="card card-wide explorer explorer-library">
        <h2 className="card-title">Intressebiblioteket</h2>
        {search}
        {errorText}
        {mine}
        {library}
      </section>
    )
  }

  if (mode === 'form') {
    return (
      <section className="explorer">
        <h2>Vad gillar du?</h2>
        {mine}
        {search}
        {errorText}
        {library}
      </section>
    )
  }

  return (
    <section className="card card-wide explorer">
      <h2 className="card-title">Vad gillar du?</h2>
      {mine}
      {search}
      {errorText}
      <button type="button" className="secondary-button explorer-open-library" onClick={onOpenLibrary}>
        Intressebiblioteket <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}

export default InterestExplorer
