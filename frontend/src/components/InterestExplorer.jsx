import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DidYouMean, MAX_INTEREST_LENGTH, NewInterestOffer } from './AddInterest'
import InterestTree, { profileTree } from './InterestTree'
import Modal from './Modal'
import { areaColors } from '../utils/interestColors'
import { getChildInterests, getTopInterests, searchInterests } from '../services/interests'

// Så länge sökningen väntar efter senaste tangenttrycket, så att inte varje
// bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// "Vad gillar du?": de valda intressena som taggar, och sök och utforska i
// intressebiblioteket för att lägga till fler. Biblioteket är ett träd
// (huvudområde › intresse › mer specifikt), och varje nivå går att välja, även
// huvudområdet självt.
//
// Komponenten sparar inget själv: `onAdd(interest)` och `onRemove(interest)`
// gör det (direkt på profilen, eller i formuläret när profilen skapas). De får
// returnera ett promise; misslyckas det visas felet här. `selected` är de valda
// intressena ({ id, name, parent_id, path, area }, eller { id, name, path } när
// profilen skapas), som visas som taggar (InterestTree). Med
// `onAddNew(result)` erbjuds man att lägga till ett intresse som inte finns när
// sökningen inte ger någon träff (se AddInterest.jsx); utan den visas bara att
// inget matchar.
//
// `card` = profilen: ett eget vitt kort med bara taggarna och "Redigera", som
// öppnar en popup med flikarna Dina (taggarna med ×) och Lägg till (InterestPicker).
// Så blir profilen aldrig lång, och inget går att ta bort av misstag. Utan `card`
// (när profilen skapas, i ett formulär) ligger allt öppet direkt, eftersom man
// måste välja minst ett intresse där.
function InterestExplorer({ selected, onAdd, onRemove, onAddNew, card = true }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(null) // null = popupen stängd, annars 'mine' eller 'add'
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

  const tags = (removable) =>
    selected.length === 0 ? (
      <p className="hint-text">Inga intressen än.</p>
    ) : (
      <InterestTree
        proposals={profileTree(selected)}
        align="start"
        busyKey={busyId === null ? null : `id:${busyId}`}
        onRemove={removable ? (key) => toggle(selected.find((i) => `id:${i.id}` === key)) : undefined}
      />
    )
  const picker = (
    <InterestPicker selectedIds={selectedIds} busyId={busyId} onToggle={toggle} onAddNew={onAddNew} onError={setError} />
  )
  const errorText = error && <p className="form-error">{error}</p>

  if (!card) {
    return (
      <section className="explorer">
        <h2>Vad gillar du?</h2>
        <div className="explorer-section">
          <h3 className="explorer-heading">Dina intressen ({selected.length})</h3>
          {tags(true)}
        </div>
        {errorText}
        {picker}
      </section>
    )
  }

  return (
    <section className="card card-wide explorer">
      <h2 className="card-title">Vad gillar du?</h2>
      <div className="explorer-section">
        <div className="explorer-heading-row">
          <h3 className="explorer-heading">Dina intressen ({selected.length})</h3>
          <button type="button" className="text-button" onClick={() => setTab(selected.length > 0 ? 'mine' : 'add')}>
            {selected.length > 0 ? 'Redigera' : 'Lägg till intressen'}
          </button>
        </div>
        {tags(false)}
      </div>
      {tab === null && errorText}

      {tab !== null && (
        <Modal title="Dina intressen" onClose={() => setTab(null)}>
          <div className="filter-tabs" role="tablist">
            {[
              ['mine', `Dina (${selected.length})`],
              ['add', 'Lägg till'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`tag${tab === id ? ' tag-selected' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`modal-scroll explorer explorer-view-${tab}`}>
            {tab === 'mine' ? (
              <>
                {selected.length > 0 && <p className="hint-text">Tryck på × för att ta bort ett intresse.</p>}
                {tags(true)}
              </>
            ) : (
              picker
            )}
          </div>
          {errorText}
        </Modal>
      )}
    </section>
  )
}

// Ett intresse att välja: en intressetagg som man trycker på för att lägga till
// eller ta bort. Vit = inte vald, i områdets färg och nedtryckt (med ✓) = vald.
// Med `onDrill` har den ett › som visar intressena under den.
function PickTag({ interest, area, label = interest.name, title, on, busy, onToggle, onDrill }) {
  return (
    <li>
      <span className={`interest-tag interest-pick${on ? ' is-on' : ''}`} style={areaColors(area)} title={title}>
        <button
          type="button"
          className="interest-pick-toggle"
          aria-pressed={on}
          aria-label={on ? `Ta bort ${label}` : `Lägg till ${label}`}
          disabled={busy}
          onClick={onToggle}
        >
          {on && <span aria-hidden="true">✓ </span>}
          {label}
        </button>
        {onDrill && (
          <button type="button" className="interest-pick-drill" aria-label={`Visa intressen under ${interest.name}`} onClick={onDrill}>
            ›
          </button>
        )}
      </span>
    </li>
  )
}

// "Lägg till": sökning och kategorierna i biblioteket. En kategori öppnar en ruta
// i sin färg med intressena som taggar att trycka på (PickTag), och › går en nivå
// ner. Rutan läggs efter den sista kategorin på samma rad som den man tryckte
// på, så att den öppnas direkt under den. `onToggle(interest)` lägger till eller
// tar bort, `selectedIds` är de valda och `busyId` det som sparas just nu.
function InterestPicker({ selectedIds, busyId, onToggle, onAddNew, onError }) {
  const [top, setTop] = useState([])
  const [loadError, setLoadError] = useState('')
  // Var man är när man utforskar: huvudområdet och vägen ner, [] = stängt.
  const [path, setPath] = useState([])
  const [level, setLevel] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ingen sökning
  const [resultsFor, setResultsFor] = useState('') // texten som träfflistan gäller
  const searchRequest = useRef(0)
  // Kategorierna (li per id), och den sista kategorin på samma rad som den öppna.
  const areaRefs = useRef(new Map())
  const panelRef = useRef(null)
  const [rowEndId, setRowEndId] = useState(null)
  const openAreaId = path[0]?.id

  useEffect(() => {
    getTopInterests()
      .then(setTop)
      .catch(() => setLoadError('Kunde inte hämta intressena. Försök igen senare.'))
  }, [])

  // Raden räknas om när man öppnar ett område och när fönstret ändrar storlek.
  // Före utritningen (useLayoutEffect), så att rutan aldrig blinkar på fel ställe.
  // Rutan döljs medan raden mäts, så att den inte trycker ner kategorierna efter
  // sig och får raden att se kortare ut än den är.
  useLayoutEffect(() => {
    if (openAreaId === undefined) return undefined
    function findRowEnd() {
      const panel = panelRef.current
      if (panel) panel.style.display = 'none'
      const rowTop = areaRefs.current.get(openAreaId)?.offsetTop
      let end = openAreaId
      for (const area of top) {
        if (areaRefs.current.get(area.id)?.offsetTop === rowTop) end = area.id
      }
      if (panel) panel.style.display = ''
      setRowEndId(end)
    }
    findRowEnd()
    window.addEventListener('resize', findRowEnd)
    return () => window.removeEventListener('resize', findRowEnd)
  }, [openAreaId, top])

  // Underintressena till det man öppnat.
  useEffect(() => {
    if (path.length === 0) {
      setLevel([])
      return undefined
    }
    let cancelled = false
    getChildInterests(path.at(-1).id)
      .then((items) => !cancelled && setLevel(items))
      .catch(() => !cancelled && onError('Kunde inte hämta underintressena.'))
    return () => {
      cancelled = true
    }
  }, [path, onError])

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
        .catch(() => request === searchRequest.current && onError('Sökningen misslyckades.'))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, onError])

  const pick = (interest, area, extra = {}) => (
    <PickTag
      key={interest.id}
      interest={interest}
      area={area}
      on={selectedIds.has(interest.id)}
      busy={busyId === interest.id}
      onToggle={() => onToggle(interest)}
      {...extra}
    />
  )

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
        onClick={() => onToggle(interest)}
      >
        {isSelected ? '✓' : '+'}
      </button>
    )
  }

  const current = path.at(-1)
  const areaName = path[0]?.name
  const areaBox = current && (
    <div className="explorer-pick-panel" style={areaColors(areaName)}>
      {/* Tillbaka och var man är, först när man gått ner en nivå (kategorin själv stängs med sin tagg). */}
      {path.length > 1 && (
        <div className="explorer-pick-top">
          <button type="button" className="secondary-button button-small" onClick={() => setPath(path.slice(0, -1))}>
            ← Tillbaka
          </button>
          <nav aria-label="Var du är" className="explorer-crumbs">
            {path.map((step, i) =>
              i === path.length - 1 ? (
                <span key={step.id} className="explorer-crumb-current">
                  {step.name}
                </span>
              ) : (
                <span key={step.id} className="explorer-crumb">
                  <button type="button" onClick={() => setPath(path.slice(0, i + 1))}>
                    {step.name}
                  </button>
                  <span aria-hidden="true">›</span>
                </span>
              ),
            )}
          </nav>
        </div>
      )}
      <p className="hint-text">Tryck för att lägga till eller ta bort.</p>
      <ul className="interest-tags">
        {/* Hela området/intresset, för den som inte vill välja något mer specifikt. */}
        {pick(current, areaName, { label: `${current.name} (allmänt)` })}
        {level.map((item) =>
          pick(item, areaName, item.has_children ? { onDrill: () => setPath([...path, item]) } : {}),
        )}
      </ul>
    </div>
  )

  return (
    <>
      <input
        type="search"
        className="explorer-search"
        aria-label="Sök intressen"
        placeholder='Sök, t.ex. "springa" eller "foto"'
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
            // Var träffen hör hemma (t.ex. "Sport och träning › Löpning") syns när man håller över den, och i färgen.
            <ul className="interest-tags">
              {results.map((item) =>
                pick(item, item.path[0] ?? item.name, { title: [...item.path, item.name].join(' › ') }),
              )}
            </ul>
          )}
        </div>
      )}

      <div className="explorer-section">
        <h3 className="explorer-heading">Utforska</h3>
        {loadError ? (
          <p className="status-error">{loadError}</p>
        ) : (
          <ul className="interest-tags">
            {top.map((area) => {
              const isOpen = openAreaId === area.id
              return (
                <Fragment key={area.id}>
                  <li ref={(el) => (el ? areaRefs.current.set(area.id, el) : areaRefs.current.delete(area.id))}>
                    {/* Huvudområdena som intressetaggar, i sin egen färg (se InterestTagGroup). */}
                    <button
                      type="button"
                      className={`interest-tag explorer-area${isOpen ? ' explorer-area-open' : ''}`}
                      style={areaColors(area.name)}
                      aria-expanded={isOpen}
                      onClick={() => setPath(isOpen ? [] : [area])}
                    >
                      {area.name}
                      {/* Nedåt: går att öppna. Vänds uppåt när området är öppet. */}
                      <span className="explorer-arrow" aria-hidden="true" />
                    </button>
                  </li>
                  {/* Rutan efter sista kategorin på den öppnas rad (före mätningen: direkt efter den). */}
                  {areaBox && area.id === (rowEndId ?? openAreaId) && (
                    <li ref={panelRef} className="explorer-panel">
                      {areaBox}
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export default InterestExplorer
