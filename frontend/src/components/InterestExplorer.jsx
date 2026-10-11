import { useEffect, useRef, useState } from 'react'
import { getChildInterests, getTopInterests, searchInterests } from '../services/interests'

// Så länge sökningen väntar efter senaste tangenttrycket, så att inte varje
// bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// "Vad gillar du?": sök och utforska intressebiblioteket och lägg till eller ta
// bort intressen. Biblioteket är ett träd (huvudområde › intresse › mer
// specifikt), och varje nivå går att välja, även huvudområdet självt.
//
// Komponenten sparar inget själv: `onAdd(interest)` och `onRemove(interest)`
// gör det (direkt på profilen, eller i formuläret när profilen skapas). De får
// returnera ett promise; misslyckas det visas felet här. `selected` är de valda
// intressena ({ id, name }). `card` = eget vitt kort (profilen); utan ligger den
// direkt i ett formulär (när profilen skapas).
//
// På profilen syns bara de valda intressena tills man trycker "Lägg till
// intressen", då fälls sök och Utforska ut. I formuläret är allt öppet direkt,
// eftersom man måste välja minst ett intresse där.
function InterestExplorer({ selected, onAdd, onRemove, card = true }) {
  const [top, setTop] = useState([])
  const [loadError, setLoadError] = useState('')
  // Var man är när man utforskar: huvudområdet och vägen ner, [] = stängt.
  const [path, setPath] = useState([])
  const [level, setLevel] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ingen sökning
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(!card)
  const searchRequest = useRef(0)

  useEffect(() => {
    getTopInterests()
      .then(setTop)
      .catch(() => setLoadError('Kunde inte hämta intressena. Försök igen senare.'))
  }, [])

  // Underintressena till det man öppnat.
  useEffect(() => {
    if (path.length === 0) {
      setLevel([])
      return undefined
    }
    let cancelled = false
    getChildInterests(path.at(-1).id)
      .then((items) => !cancelled && setLevel(items))
      .catch(() => !cancelled && setError('Kunde inte hämta underintressena.'))
    return () => {
      cancelled = true
    }
  }, [path])

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
        .then((items) => request === searchRequest.current && setResults(items))
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

  function addButton(interest, label = interest.name) {
    const isSelected = selectedIds.has(interest.id)
    return (
      <button
        type="button"
        className={`explorer-add${isSelected ? ' explorer-add-on' : ''}`}
        aria-label={isSelected ? `Ta bort ${label}` : `Lägg till ${label}`}
        aria-pressed={isSelected}
        disabled={busyId === interest.id}
        onClick={() => toggle(interest)}
      >
        {isSelected ? '✓' : '+'}
      </button>
    )
  }

  // Stänger man börjar man om nästa gång: ingen gammal sökning eller öppet område.
  function toggleOpen() {
    if (open) {
      setQuery('')
      setPath([])
    }
    setOpen(!open)
  }

  const current = path.at(-1)

  return (
    <section className={card ? 'card card-wide explorer' : 'explorer'}>
      <h2 className={card ? 'card-title' : undefined}>Vad gillar du?</h2>

      <div className="explorer-section">
        <h3 className="explorer-heading">Dina intressen ({selected.length})</h3>
        {selected.length === 0 ? (
          <p className="hint-text">Inga intressen än.</p>
        ) : (
          <ul className="tags">
            {selected.map((interest) => (
              <li key={interest.id}>
                <button
                  type="button"
                  className="tag tag-selected"
                  aria-label={`Ta bort ${interest.name}`}
                  disabled={busyId === interest.id}
                  onClick={() => toggle(interest)}
                >
                  {interest.name} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {card && (
        <button
          type="button"
          className={`secondary-button explorer-toggle${open ? ' explorer-toggle-open' : ''}`}
          aria-expanded={open}
          onClick={toggleOpen}
        >
          {open ? 'Klar' : 'Lägg till intressen'}
          <span className="explorer-arrow" aria-hidden="true" />
        </button>
      )}

      {open && (
        <>
          <p className="hint-text">Sök eller utforska, och tryck på + vid det du gillar.</p>

          <input
            type="search"
            className="explorer-search"
            aria-label="Sök intressen"
            placeholder='Sök, t.ex. "springa" eller "foto"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {results && (
            <div className="explorer-box">
              {results.length === 0 ? (
                <p className="hint-text">Inget intresse matchar "{query.trim()}" än.</p>
              ) : (
                <ul className="explorer-rows">
                  {results.map((item) => (
                    <li key={item.id} className="explorer-row">
                      <span className="explorer-name">
                        {item.name}
                        {/* Var träffen hör hemma, t.ex. "Sport och träning › Löpning". */}
                        <span className="hint-text">{item.path.length ? item.path.join(' › ') : 'Huvudområde'}</span>
                      </span>
                      {addButton(item)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="explorer-section">
            <h3 className="explorer-heading">Utforska</h3>
            {loadError ? (
              <p className="status-error">{loadError}</p>
            ) : (
              <ul className="tags">
                {top.map((area) => {
                  const isOpen = path[0]?.id === area.id
                  return (
                    <li key={area.id}>
                      <button
                        type="button"
                        className={`tag explorer-area${isOpen ? ' explorer-area-open' : ''}`}
                        aria-expanded={isOpen}
                        onClick={() => setPath(isOpen ? [] : [area])}
                      >
                        {area.name}
                        {/* Nedåt: går att öppna. Vänds uppåt när området är öppet. */}
                        <span className="explorer-arrow" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {current && (
              <div className="explorer-box">
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
                <ul className="explorer-rows">
                  {/* Hela området/intresset, för den som inte vill välja något mer specifikt. */}
                  <li className="explorer-row">
                    <span className="explorer-name">{current.name} (allmänt)</span>
                    {addButton(current, `${current.name} (allmänt)`)}
                  </li>
                  {level.map((item) => (
                    <li key={item.id} className="explorer-row">
                      {item.has_children ? (
                        <button type="button" className="explorer-drill" onClick={() => setPath([...path, item])}>
                          <span>{item.name}</span>
                          <span aria-hidden="true">›</span>
                        </button>
                      ) : (
                        <span className="explorer-name">{item.name}</span>
                      )}
                      {addButton(item)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export default InterestExplorer
