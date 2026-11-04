import { useEffect, useRef, useState } from 'react'
import { DidYouMean, MAX_INTEREST_LENGTH, NewInterestOffer } from './AddInterest'
import CheckMark from './CheckMark'
import InterestInfo from './InterestInfo'
import InterestLibrary, { PickTag } from './InterestLibrary'
import InterestTree, { profileTree } from './InterestTree'
import { searchInterests } from '../services/interests'
import InfoTip from './InfoTip'
import SearchField from './SearchField'
import SearchToggle from './SearchToggle'
import IconButton from './IconButton'

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
// intressena ({ id, name, parent_id, path, area_slug }, eller { id, name, path, area_slug } från
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
//
// Utom i 'form' öppnar ett tryck på en sökträff eller ett intresse i biblioteket som man inte har valt en ruta om det
// (InterestInfo, SCRUM-306) med antal och "Lägg till på min profil". Ett tryck på ett valt intresse tar bort det, utan
// rutan (`onRemove`, som på profilen frågar först).
function InterestExplorer({ selected, onAdd, onRemove, onAddNew, mode = 'card', onOpenLibrary }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ingen sökning
  const [resultsFor, setResultsFor] = useState('') // texten som träfflistan gäller
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const removable = mode === 'form' || editing
  // Intresset vars ruta är öppen (InterestInfo), eller null. Rutans antal kräver en klar profil, så inte i 'form'.
  const [info, setInfo] = useState(null)
  const onInfo = mode === 'form' ? undefined : setInfo
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
        {isSelected ? <CheckMark /> : '+'}
      </button>
    )
  }

  const searchField = (
    <SearchField
      aria-label="Lägg till ett intresse"
      placeholder={mode === 'library' ? 'Sök bland alla intressen' : 'Lägg till ett intresse, t.ex. "foto"'}
      maxLength={MAX_INTEREST_LENGTH}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onClear={() => setQuery('')}
    />
  )

  const search = (
    <>
      {/* Sökikonen bara där man också kan leta för hand i biblioteket. På profilkortet är fältet sättet att lägga
          till. */}
      {mode === 'card' ? (
        searchField
      ) : (
        <SearchToggle
          label={mode === 'library' ? 'Sök bland alla intressen' : 'Lägg till ett intresse'}
          count={query ? 1 : 0}
        >
          {searchField}
        </SearchToggle>
      )}
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
                  areaSlug={item.area_slug}
                  title={[...item.path, item.name].join(' › ')}
                  on={selectedIds.has(item.id)}
                  busy={busyId === item.id}
                  onToggle={toggle}
                  onInfo={onInfo}
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
        <h3 className="explorer-heading">
          Dina intressen ({selected.length})
          {mode === 'card' && editing && (
            <>
              {' '}
              <InfoTip text="Tryck på × för att ta bort ett intresse." />
            </>
          )}
        </h3>
        {mode === 'card' && selected.length > 0 && (
          editing ? (
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Klar
            </button>
          ) : (
            <IconButton icon="edit" label="Redigera intressena" onClick={() => setEditing(true)} />
          )
        )}
      </div>
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
      <InterestLibrary
        selectedIds={selectedIds}
        busyId={busyId}
        onToggle={toggle}
        onError={setError}
        onInfo={onInfo}
      />
    </div>
  )
  // Rutan stängs först, så att ett fel när intresset sparas syns här under den.
  const infoBox = info && (
    <InterestInfo
      interest={info}
      onClose={() => setInfo(null)}
      onAdd={() => {
        setInfo(null)
        toggle(info)
      }}
    />
  )

  if (mode === 'library') {
    return (
      <section className="card card-wide explorer explorer-library">
        <h2 className="card-title">Intressebiblioteket</h2>
        {search}
        {errorText}
        {mine}
        {library}
        {infoBox}
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
    <section className="card card-wide card-soft explorer">
      <h2 className="card-title">Vad gillar du?</h2>
      {mine}
      {search}
      {errorText}
      {infoBox}
      <button type="button" className="secondary-button explorer-open-library" onClick={onOpenLibrary}>
        Intressebiblioteket <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}

export default InterestExplorer
