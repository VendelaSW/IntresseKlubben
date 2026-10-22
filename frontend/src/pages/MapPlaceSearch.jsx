import { useEffect, useId, useState } from 'react'
import { searchPlaces } from '../services/geocode'
import { LANDSKAP_LABELS, LAN_LABELS } from './mapPrototypeStyle'
import { allKommuner } from './mapPrototypeZoomLevels'

// Sökrutan på kartan (SCRUM-220): sök efter allt som finns på kartan, så flyger
// kartan dit. Förslagen kommer medan man skriver:
// - kommuner, län och landskap (finns redan i appen, så de kommer direkt),
// - klubbar och events på kartan (`activities`, lapparna, se mapPrototypeActivities),
// - orter, platser och adresser ("Gustavsberg", "Slottsskogen", "Storgatan 1")
//   från adressökningen, en kort stund efter att man slutat skriva.
// "Min kommun" tar en tillbaka till ens egen kommun, samma vy som när kartan öppnas.
//
// `onPick(förslag)` flyttar kartan; förslaget har `kind` ('kommun', 'lan',
// 'landskap', 'klubb', 'event' eller 'place') och det som behövs för att hitta
// dit. `onHome` saknas när profilen inte har någon kommun.
const MAX_REGIONS = 5
const MAX_ACTIVITIES = 4
const MAX_PLACES = 4
// Adressökningen behöver minst tre tecken (se GET /geocode), och väntar tills man
// har slutat skriva en stund, så att inte varje bokstav blir en sökning.
const MIN_PLACE_SEARCH = 3
const PLACE_SEARCH_DELAY_MS = 400

const normalize = (text) => text.toLocaleLowerCase('sv').replace(/\s+/g, ' ').trim()

// Län och landskap ur kartans egna data. Länens namnpunkter finns en gång per
// landskap länet ligger i, så de tas bara med en gång.
const LAN = [...new Map(LAN_LABELS.map((l) => [l.id, { kind: 'lan', key: `lan:${l.id}`, name: l.name, sub: 'Län', kod: l.id }])).values()]
const LANDSKAP = LANDSKAP_LABELS.map((l) => ({
  kind: 'landskap',
  key: `landskap:${l.id}`,
  name: l.name,
  sub: 'Landskap',
  lngLat: l.lngLat,
}))

// De som innehåller texten, de som börjar med den först, och högst `max`.
function matching(items, wanted, max) {
  return items
    .filter((item) => normalize(item.name).includes(wanted))
    .sort((a, b) => {
      const aStarts = normalize(a.name).startsWith(wanted)
      const bStarts = normalize(b.name).startsWith(wanted)
      return aStarts === bStarts ? a.name.localeCompare(b.name, 'sv') : aStarts ? -1 : 1
    })
    .slice(0, max)
}

function MapPlaceSearch({ activities = [], onPick, onHome }) {
  const listId = useId()
  const [kommuner, setKommuner] = useState([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Träffarna från adressökningen och vilken text de gäller (null = inte sökt än).
  const [places, setPlaces] = useState({ text: null, items: [] })

  useEffect(() => {
    let cancelled = false
    allKommuner()
      .then((all) => {
        if (cancelled) return
        setKommuner(
          [...all.values()].map(({ kod, name }) => ({ kind: 'kommun', key: `kommun:${kod}`, name: `${name} kommun`, sub: 'Kommun', kod })),
        )
      })
      .catch(() => {
        // Utan kommunlistan fungerar resten av sökningen ändå.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Adressökningen, när man har slutat skriva en stund. Ett fel (eller för många
  // sökningar) ger bara inga förslag därifrån: resten av sökningen fungerar ändå.
  const text = query.trim()
  useEffect(() => {
    if (text.length < MIN_PLACE_SEARCH) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      searchPlaces(text)
        .then((found) => {
          if (cancelled) return
          const items = found.slice(0, MAX_PLACES).map((place, i) => {
            const [name, ...rest] = place.label.split(',').map((part) => part.trim())
            return { kind: 'place', key: `place:${i}:${place.label}`, name, sub: rest.join(', ') || 'Plats', place }
          })
          setPlaces({ text, items })
        })
        .catch(() => !cancelled && setPlaces({ text, items: [] }))
    }, PLACE_SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text])

  const wanted = normalize(query)
  const activityOptions = activities.map((item) => ({
    kind: item.type,
    key: `${item.type}:${item.id}`,
    name: item.name,
    sub: `${item.type === 'klubb' ? 'Klubb' : 'Event'} · ${item.sub}`,
    item,
  }))
  const placeOptions = places.text === text ? places.items : []
  const options = wanted
    ? [
        ...matching([...kommuner, ...LAN, ...LANDSKAP], wanted, MAX_REGIONS),
        ...matching(activityOptions, wanted, MAX_ACTIVITIES),
        ...placeOptions,
      ]
    : []
  const searchingPlaces = text.length >= MIN_PLACE_SEARCH && places.text !== text

  function reset() {
    setQuery('')
    setOpen(false)
    setActive(-1)
  }

  function choose(option) {
    reset()
    onPick(option)
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + options.length) % options.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      // Den markerade raden, annars den översta.
      const option = options[active >= 0 ? active : 0]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      // Stänger listan; en andra Escape tömmer rutan.
      if (open && options.length > 0) setOpen(false)
      else reset()
    }
  }

  const showList = open && wanted !== '' && (options.length > 0 || searchingPlaces)
  return (
    <div className="map-place-search">
      <div className="map-place-search-row">
        <input
          type="search"
          className="map-place-search-input"
          placeholder="Sök på kartan"
          aria-label="Sök en plats, kommun, klubb eller event på kartan"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {onHome && (
          <button type="button" className="map-tool touch-target" onClick={onHome}>
            Min kommun
          </button>
        )}
      </div>
      {showList && (
        <ul id={listId} className="map-place-search-list" role="listbox" aria-label="Förslag">
          {options.map((option, i) => (
            <li
              key={option.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`map-place-search-option${i === active ? ' is-active' : ''}`}
              // mousedown, inte click: annars hinner rutan tappa fokus och listan stängas först.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(option)
              }}
            >
              <span className="map-place-search-name">{option.name}</span>
              <span className="map-place-search-sub">{option.sub}</span>
            </li>
          ))}
          {searchingPlaces && (
            <li className="map-place-search-pending" aria-hidden="true">
              Söker platser...
            </li>
          )}
        </ul>
      )}
      {open && wanted !== '' && options.length === 0 && !searchingPlaces && (
        <p className="map-place-search-message" role="status">
          Hittade inget som heter &quot;{text}&quot; på kartan.
        </p>
      )}
    </div>
  )
}

export default MapPlaceSearch
