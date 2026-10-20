import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { searchInterests, suggestInterest } from '../services/interests'

// Lägg till ett intresse som inte finns i biblioteket. Samma funktion överallt, i två lägen:
//
//  - NewInterestOffer (profilen): den utforskaren visar när sökningen inte ger någon träff (se InterestExplorer).
//  - AddInterest (intervjun): en egen ruta med sökning bland befintliga intressen, och samma erbjudande när det inte finns.
//
// Flödet: man skriver ett intresse (högst MAX_INTEREST_LENGTH tecken). Finns det inte får man "Lägg till ... som nytt
// intresse?". Då kontrollerar backend det (ordfilter, moderation, granskning) och väljer en förälder. Godkänns det visas
// InterestPrompt: "Vill du lägga till ... som intresse?". Godkänns det inte visas bara ett felmeddelande. Vad som händer
// när man trycker "Lägg till" bestämmer sidan, med `onAddNew(result)`: profilen sparar direkt (confirmInterests), intervjun
// lägger förslaget i sin lista och sparar i slutet.

// Måste stämma med backend (MAX_PHRASE_LENGTH i schemas/analysis.py).
export const MAX_INTEREST_LENGTH = 40

// Så länge sökningen väntar efter senaste tangenttrycket, så att inte varje bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// Backendens svenska meddelande när det finns (godkänns inte, för många försök, går inte att kontrollera), annars ett
// allmänt.
function messageOf(error) {
  return error instanceof ApiError ? error.message : 'Något gick fel. Kontrollera anslutningen och försök igen.'
}

// Frågan innan intresset läggs till. Bara utseende: `proposals` är förslagen från backend (oftast ett), som visas med var
// de hamnar. Ett intresse som redan finns (is_new = false) visas som det som passar bäst.
export function InterestPrompt({ proposals, busy = false, error = '', boxed = true, onConfirm, onCancel }) {
  const names = proposals.map((p) => p.interest.name).join(', ')
  return (
    <div className={boxed ? 'explorer-box' : undefined} role="group" aria-label="Lägg till intresse">
      <p>Vill du lägga till "{names}" som intresse?</p>
      <ul className="explorer-rows">
        {proposals.map((p) => (
          <li key={p.key} className="explorer-row">
            <span className="explorer-name">
              {p.interest.name}
              <span className="hint-text">
                {p.interest.is_new ? 'Nytt intresse' : 'Finns redan i biblioteket'}
                {p.interest.path.length > 0 && ` · ${p.interest.path.join(' › ')}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="form-error">{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Lägger till...' : 'Lägg till'}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  )
}

// Kärnan: erbjudandet för en text som inte gav någon träff. `onAddNew(result)` får { token, proposals } och returnerar ett
// promise (misslyckas det visas felet här). `onDone` anropas när intresset är tillagt. `boxed` = egen ruta (utforskaren har
// redan en runt träfflistan och visar den utan).
export function NewInterestOffer({ text, onAddNew, onDone, boxed = true }) {
  const [phase, setPhase] = useState('idle') // idle, checking, ask, saving
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const request = useRef(0)

  // En ny text börjar om, och ett svar på en äldre text kastas.
  useEffect(() => {
    request.current += 1
    setPhase('idle')
    setResult(null)
    setError('')
  }, [text])

  async function check() {
    const mine = ++request.current
    setPhase('checking')
    setError('')
    try {
      const data = await suggestInterest(text)
      if (mine !== request.current) return
      setResult(data)
      setPhase('ask')
    } catch (err) {
      if (mine !== request.current) return
      setError(messageOf(err))
      setPhase('idle')
    }
  }

  async function confirm() {
    const mine = request.current
    setPhase('saving')
    setError('')
    try {
      await onAddNew(result)
      onDone?.()
    } catch (err) {
      if (mine !== request.current) return
      setError(messageOf(err))
      setPhase('ask')
    }
  }

  function cancel() {
    setPhase('idle')
    setResult(null)
    setError('')
  }

  if (phase === 'ask' || phase === 'saving') {
    return (
      <InterestPrompt
        proposals={result.proposals}
        busy={phase === 'saving'}
        error={error}
        boxed={boxed}
        onConfirm={confirm}
        onCancel={cancel}
      />
    )
  }

  return (
    <div className={boxed ? 'explorer-box' : undefined} aria-live="polite">
      <p className="hint-text">Inget intresse matchar "{text}" än.</p>
      <button type="button" className="secondary-button" disabled={phase === 'checking'} onClick={check}>
        {phase === 'checking' ? 'Kontrollerar...' : `Lägg till "${text}" som nytt intresse`}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// Intervjuns version: en ruta där man skriver ett intresse, med träffar bland befintliga intressen medan man skriver, och
// erbjudandet när det inte finns. `selectedIds` är intressena som redan är valda (de visas som valda). `onPickExisting(interest)`
// anropas när man väljer ett befintligt, och `onAddNew(result)` när man lägger till ett nytt. Båda får returnera ett promise.
function AddInterest({ selectedIds = [], onPickExisting, onAddNew }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ingen sökning
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const searchRequest = useRef(0)
  const chosen = new Set(selectedIds)

  // Sökningen, en kort stund efter senaste tangenttrycket. Ett svar på en äldre sökning kastas.
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

  async function pick(interest) {
    setBusyId(interest.id)
    setError('')
    try {
      await onPickExisting(interest)
      setQuery('')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="explorer">
      <input
        type="search"
        className="explorer-search"
        aria-label="Lägg till ett intresse"
        placeholder="Lägg till ett intresse"
        maxLength={MAX_INTEREST_LENGTH}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && <p className="form-error">{error}</p>}
      {results &&
        (results.length === 0 ? (
          <NewInterestOffer text={query.trim()} onAddNew={onAddNew} onDone={() => setQuery('')} />
        ) : (
          <div className="explorer-box">
            <ul className="explorer-rows">
              {results.map((item) => (
                <li key={item.id} className="explorer-row">
                  <span className="explorer-name">
                    {item.name}
                    <span className="hint-text">{item.path.length ? item.path.join(' › ') : 'Huvudområde'}</span>
                  </span>
                  <button
                    type="button"
                    className={`explorer-add${chosen.has(item.id) ? ' explorer-add-on' : ''}`}
                    aria-label={chosen.has(item.id) ? `${item.name} är redan tillagt` : `Lägg till ${item.name}`}
                    aria-pressed={chosen.has(item.id)}
                    disabled={busyId === item.id || chosen.has(item.id)}
                    onClick={() => pick(item)}
                  >
                    {chosen.has(item.id) ? '✓' : '+'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}

export default AddInterest
