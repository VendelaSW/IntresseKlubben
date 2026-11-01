import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchInterests } from '../services/interests'

// Samma väntan efter senaste tangenttrycket som i AddInterest, så att inte varje bokstav blir ett anrop.
const SEARCH_DELAY_MS = 300

// Fler träffar än så får inte plats i listan; man skriver mer för att begränsa dem.
const MAX_RESULTS = 8

// Måste stämma med AddInterest (och backend).
const MAX_QUERY_LENGTH = 40

const swedishOrder = new Intl.Collator('sv')

// Intresseväljaren i filtren (Medlemmar, Klubbar och Events) och i Skapa klubb och Skapa event (SCRUM-311). Man skriver
// och väljer bland träffarna i hela biblioteket, även på andra namn ("pokemon" ger Pokémon TCG), med musen eller med
// pilarna och Enter. Med tomt fält visas ens egna intressen (`myInterests`) som snabbval. Fungerar som
// MunicipalityPicker och har samma utseende (dess klasser): `value` är det valda intresset ({ id, name }) eller null,
// och `onChange` får det nya. Ett tömt fält tar bort valet, och skriver man något utan att välja står det förra kvar.
// Med ett val visas ett kryss som tar bort det.
function InterestPicker({
  id,
  value,
  onChange,
  myInterests = [],
  placeholder = 'Sök intresse...',
  required = false,
  'aria-label': ariaLabel,
}) {
  const listId = useId()
  const listRef = useRef(null)
  const inputRef = useRef(null)
  // Texten man håller på att skriva, eller null när man inte skriver (då visas det valda intressets namn).
  const [query, setQuery] = useState(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [results, setResults] = useState(null) // null = ingen sökning, annars { text, items } för texten som söktes
  const [failed, setFailed] = useState(false)
  const searchRequest = useRef(0)

  const text = query?.trim() ?? ''

  // Sökningen, en kort stund efter senaste tangenttrycket. Ett svar på en äldre sökning kastas.
  useEffect(() => {
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
  }, [text])

  // Träffarna visas först när sökningen gäller texten som står i fältet, annars skulle man se träffar för något annat.
  const shown = results && results.text === text ? results.items : null
  const sortedMine = useMemo(
    () => [...myInterests].sort((a, b) => swedishOrder.compare(a.name, b.name)),
    [myInterests],
  )
  const items = text ? (shown ?? []).slice(0, MAX_RESULTS) : sortedMine

  // Den markerade raden ska synas när man bläddrar med pilarna.
  useEffect(() => {
    if (open) listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function pick(interest) {
    setQuery(null)
    setOpen(false)
    if (interest?.id !== value?.id) onChange(interest && { id: interest.id, name: interest.name })
  }

  function close() {
    setOpen(false)
    if (query === null) return
    // Har man skrivit hela namnet räknas det som ett val, och ett tömt fält tar bort valet. Annars står det förra kvar.
    const exact = shown?.find((i) => i.name.toLocaleLowerCase('sv') === text.toLocaleLowerCase('sv'))
    if (exact) pick(exact)
    else if (!text) pick(null)
    else setQuery(null)
  }

  function openList() {
    setOpen(true)
    setActive(0)
  }

  // Krysset försvinner när valet är borttaget, så fokus flyttas till fältet i stället för att tappas.
  function clear() {
    pick(null)
    inputRef.current?.focus()
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((a) => Math.min(Math.max(a + step, 0), Math.max(items.length - 1, 0)))
    } else if (event.key === 'Enter' && open) {
      // Enter väljer i listan i stället för att skicka formuläret.
      event.preventDefault()
      if (items[active]) pick(items[active])
    } else if (event.key === 'Escape' && open) {
      // Escape stänger bara listan, inte blocket runt den (MapPad lyssnar på Escape på hela sidan).
      event.preventDefault()
      event.stopPropagation()
      setQuery(null)
      setOpen(false)
    }
  }

  const activeItem = open ? items[active] : null
  // Vad listan säger när den inte har några val: att man kan söka, att sökningen pågår, eller att inget matchar.
  const status = !text
    ? 'Skriv för att söka bland alla intressen.'
    : failed
      ? 'Sökningen misslyckades.'
      : !shown
        ? 'Söker...'
        : shown.length === 0
          ? `Inga intressen matchar "${text}".`
          : shown.length > MAX_RESULTS
            ? 'Skriv mer för att se färre träffar.'
            : null

  return (
    <div className="municipality-picker interest-picker">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        maxLength={MAX_QUERY_LENGTH}
        value={query ?? value?.name ?? ''}
        required={required}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onClick={() => !open && openList()}
        onFocus={(event) => event.target.select()}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {value && query === null && (
        <button
          type="button"
          className="field-clear"
          aria-label={`Ta bort ${value.name}`}
          onClick={clear}
        >
          ×
        </button>
      )}
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="municipality-picker-list">
          {!text && items.length > 0 && (
            <li role="presentation" className="interest-picker-heading">
              Dina intressen
            </li>
          )}
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={item.id === value?.id}
              className={`municipality-picker-option${index === active ? ' is-active' : ''}`}
              // mousedown i stället för click, så att fältet inte hinner tappa fokus (och stänga listan) innan
              // valet görs.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(item)
              }}
              onMouseEnter={() => setActive(index)}
            >
              {item.name}
              {item.path && (
                <span className="interest-picker-path">{item.path.length ? item.path.join(' › ') : 'Huvudområde'}</span>
              )}
            </li>
          ))}
          {status && (
            <li role="presentation" className="municipality-picker-none">
              {status}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default InterestPicker
