import { useEffect, useId, useRef, useState } from 'react'

// Jämför kommunnamn: små bokstäver, utan å/ä/ö-prickar och utan "kommun", så att
// "goteborg" hittar Göteborg och "Härryda kommun" hittar Härryda.
const normalize = (text) =>
  text
    .toLocaleLowerCase('sv')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\bkommun\b/g, '')
    .trim()

// Kommunerna som matchar texten: de vars namn börjar med texten först, sedan de
// som har den någon annanstans i namnet (listan är redan i svensk ordning).
function matching(municipalities, query) {
  const wanted = normalize(query)
  if (!wanted) return municipalities
  const starts = []
  const contains = []
  for (const m of municipalities) {
    const name = normalize(m.name)
    if (name.startsWith(wanted)) starts.push(m)
    else if (name.includes(wanted)) contains.push(m)
  }
  return [...starts, ...contains]
}

// Sökbart kommunfält: man skriver och väljer i listan under (eller med pilarna
// och Enter). Bara kommuner i listan kan väljas; skriver man något annat och
// går ur fältet står den förra kommunen kvar. Fungerar som en <select>: `value`
// är kommunkoden ('' = ingen) och `onChange` får den nya koden.
//
// `municipalities`: [{ code, name }] från getMunicipalities.
// `emptyLabel`: finns den kan man välja "ingen" (t.ex. "Alla kommuner" i ett
// filter), och den står då i fältet när inget är valt.
function MunicipalityPicker({
  id,
  municipalities,
  value,
  onChange,
  emptyLabel = null,
  required = false,
  autoFocus = false,
  'aria-label': ariaLabel,
}) {
  const listId = useId()
  const listRef = useRef(null)
  // Texten man håller på att skriva, eller null när man inte skriver (då visas
  // den valda kommunens namn).
  const [query, setQuery] = useState(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const selected = municipalities.find((m) => m.code === value) ?? null
  const options = matching(municipalities, query ?? '')
  // Det tomma valet ligger först när man inte har skrivit något.
  const items = emptyLabel && !query?.trim() ? [{ code: '', name: emptyLabel }, ...options] : options

  // Den markerade raden ska synas när man bläddrar med pilarna.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function pick(item) {
    setQuery(null)
    setOpen(false)
    if (item.code !== value) onChange(item.code)
  }

  function close() {
    setOpen(false)
    if (query === null) return
    // Har man skrivit hela namnet räknas det som ett val, och ett tömt fält
    // väljer "ingen" när det går. Annars står den förra kommunen kvar.
    const exact = municipalities.find((m) => normalize(m.name) === normalize(query))
    if (exact) pick(exact)
    else if (!query.trim() && emptyLabel) pick({ code: '' })
    else setQuery(null)
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
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

  const shown = query ?? selected?.name ?? ''
  const activeItem = open ? items[active] : null

  return (
    <div className="municipality-picker">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeItem ? `${listId}-${activeItem.code || 'tom'}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={emptyLabel ?? 'Sök kommun...'}
        value={shown}
        required={required}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onClick={() => setOpen(true)}
        onFocus={(event) => event.target.select()}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="municipality-picker-list">
          {items.length === 0 ? (
            <li className="municipality-picker-none">Ingen kommun heter så. Välj kommunen orten ligger i.</li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.code || 'tom'}
                id={`${listId}-${item.code || 'tom'}`}
                role="option"
                aria-selected={item.code === value}
                className={`municipality-picker-option${index === active ? ' is-active' : ''}`}
                // mousedown i stället för click, så att fältet inte hinner
                // tappa fokus (och stänga listan) innan valet görs.
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(item)
                }}
                onMouseEnter={() => setActive(index)}
              >
                {item.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export default MunicipalityPicker
