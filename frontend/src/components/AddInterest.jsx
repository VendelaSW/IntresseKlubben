import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { searchInterests, similarInterests, suggestInterest } from '../services/interests'

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

// Så kort text får inte ett "Menade du" (backend kräver samma).
const MIN_SIMILAR_LENGTH = 3

// Så länge sökningen väntar efter senaste tangenttrycket, så att inte varje bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// Ett fel med ett meddelande som ska visas som det är (t.ex. att intresset redan finns bland de valda), från sidan som tar
// emot ett nytt intresse i onAddNew.
export class AddInterestError extends Error {}

// Backendens svenska meddelande när det finns (godkänns inte, för många försök, går inte att kontrollera), annars ett
// allmänt.
function messageOf(error) {
  return error instanceof ApiError || error instanceof AddInterestError
    ? error.message
    : 'Något gick fel. Kontrollera anslutningen och försök igen.'
}

// "Menade du:" för en text som inte gav någon träff: intressen med liknande betydelse, så att man hittar det som finns i
// stället för att skapa en variant. `action(item)` ger knappen vid varje rad (sidan bestämmer vad den gör). Visar inget
// medan förslagen hämtas eller om inget liknar, och ett fel ger inget förslag: det är en hjälp, aldrig ett hinder.
export function DidYouMean({ text, action }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    setItems([])
    if (text.length < MIN_SIMILAR_LENGTH) return undefined
    let cancelled = false
    similarInterests(text)
      .then((found) => !cancelled && setItems(found))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [text])

  if (items.length === 0) return null
  return (
    <div aria-live="polite">
      <p className="hint-text">Menade du:</p>
      <ul className="explorer-rows">
        {items.map((item) => (
          <li key={item.id} className="explorer-row">
            <span className="explorer-name">
              {item.name}
              <span className="hint-text">{item.path.length ? item.path.join(' › ') : 'Huvudområde'}</span>
            </span>
            {action(item)}
          </li>
        ))}
      </ul>
    </div>
  )
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

// Kärnan: erbjudandet för en text som inte gav någon träff. `onAddNew(result)` får { token, proposals, text } och returnerar ett
// promise (misslyckas det visas felet här). `onDone` anropas när intresset är tillagt. `boxed` = egen ruta (utforskaren har
// redan en runt träfflistan och visar den utan). `children` visas mellan "Inget intresse matchar" och knappen (se DidYouMean).
export function NewInterestOffer({ text, onAddNew, onDone, boxed = true, children }) {
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
      setResult({ ...data, text }) // med texten, så att sidan kan tolka om det när sigillet gått ut
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
      {children}
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
  const [results, setResults] = useState(null) // null = ingen sökning, annars { text, items } för texten som söktes
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
        .then((items) => request === searchRequest.current && setResults({ text, items }))
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

  function pickButton(item) {
    return (
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
    )
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
      {/* Träfflistan (och erbjudandet) visas först när sökningen gäller texten som står i rutan, annars skulle man kunna
          trycka på "Lägg till" för något som har träffar. */}
      {results &&
        results.text === query.trim() &&
        (results.items.length === 0 ? (
          <NewInterestOffer text={results.text} onAddNew={onAddNew} onDone={() => setQuery('')}>
            <DidYouMean text={results.text} action={pickButton} />
          </NewInterestOffer>
        ) : (
          <div className="explorer-box">
            <ul className="explorer-rows">
              {results.items.map((item) => (
                <li key={item.id} className="explorer-row">
                  <span className="explorer-name">
                    {item.name}
                    <span className="hint-text">{item.path.length ? item.path.join(' › ') : 'Huvudområde'}</span>
                  </span>
                  {pickButton(item)}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}

export default AddInterest
