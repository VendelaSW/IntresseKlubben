import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { getChildInterests, getTopInterests } from '../services/interests'
import { areaColors } from '../utils/interestColors'
import DrawnArrow from './DrawnArrow'

// Ett intresse att trycka på för att lägga till eller ta bort det: en intressetagg
// i huvudområdets färg (`area`). Inte valt: den ljusa nyansen och +. Valt:
// områdets färg, ✓, fetstil och nedtryckt. `title` (valfri) syns när man håller
// över, t.ex. var en sökträff hör hemma.
export function PickTag({ interest, area, label = interest.name, title, on, busy, onToggle }) {
  return (
    <li>
      <button
        type="button"
        className={`interest-tag interest-pick${on ? ' is-on' : ''}`}
        style={areaColors(area)}
        title={title}
        aria-pressed={on}
        disabled={busy}
        onClick={() => onToggle(interest)}
      >
        <span className="interest-pick-mark" aria-hidden="true">
          {on ? '✓' : '+'}
        </span>
        {label}
      </button>
    </li>
  )
}

// Ett intresse med underintressen: taggen går att välja, och pilen i den öppnar
// en ruta under taggen med underintressena (samma ruta som på profilens taggar,
// se InterestTagGroup). Rutan stängs med pilen, ett tryck utanför eller Esc. Den
// scrollas fram när den öppnas, så att den syns också på den nedersta raden.
function PickGroup({ interest, area, picked }) {
  const [open, setOpen] = useState(false)
  const [kids, setKids] = useState(null) // null = inte hämtade än
  const close = useCallback(() => setOpen(false), [])
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  useDismiss(rootRef, open, close)

  useEffect(() => {
    if (open && kids) panelRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, kids])

  const { onError } = picked
  useEffect(() => {
    if (!open || kids !== null) return undefined
    let cancelled = false
    getChildInterests(interest.id)
      .then((items) => !cancelled && setKids(items))
      .catch(() => !cancelled && onError('Kunde inte hämta underintressena.'))
    return () => {
      cancelled = true
    }
  }, [open, kids, interest.id, onError])

  const on = picked.selectedIds.has(interest.id)
  return (
    <li ref={rootRef} className={`interest-tag-group${open ? ' is-open' : ''}`} style={areaColors(area)}>
      <span className={`interest-tag interest-pick interest-pick-group${on ? ' is-on' : ''}`}>
        <button
          type="button"
          className="interest-pick-toggle"
          aria-pressed={on}
          disabled={picked.busyId === interest.id}
          onClick={() => picked.onToggle(interest)}
        >
          <span className="interest-pick-mark" aria-hidden="true">
            {on ? '✓' : '+'}
          </span>
          {interest.name}
        </button>
        <button
          type="button"
          className="interest-pick-drill"
          aria-expanded={open}
          aria-label={`${open ? 'Dölj' : 'Visa'} intressen under ${interest.name}`}
          onClick={() => setOpen(!open)}
        >
          <DrawnArrow className="interest-tag-arrow" />
        </button>
      </span>
      {open && kids && (
        <ul ref={panelRef} className="interest-tag-panel">
          {kids.map((kid) => (
            <PickTag
              key={kid.id}
              interest={kid}
              area={area}
              on={picked.selectedIds.has(kid.id)}
              busy={picked.busyId === kid.id}
              onToggle={picked.onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// Intressebiblioteket som taggar: huvudområdena (Utforska), och ett tryck öppnar
// området i en ruta i dess färg med intressena som taggar att trycka på. Området
// självt går också att välja ("(allmänt)"). Har ett intresse underintressen
// öppnar pilen i taggen dem (PickGroup). Biblioteket har tre nivåer (område ›
// intresse › mer specifikt).
// `selectedIds` är de valda, `busyId` det som sparas just nu, `onToggle(interest)`
// lägger till eller tar bort och `onError(text)` visar ett fel.
function InterestLibrary({ selectedIds, busyId, onToggle, onError }) {
  const [top, setTop] = useState([])
  const [loadError, setLoadError] = useState('')
  const [area, setArea] = useState(null) // det öppna området
  const [level, setLevel] = useState([])
  const picked = { selectedIds, busyId, onToggle, onError }

  useEffect(() => {
    getTopInterests()
      .then(setTop)
      .catch(() => setLoadError('Kunde inte hämta intressena. Försök igen senare.'))
  }, [])

  useEffect(() => {
    if (!area) {
      setLevel([])
      return undefined
    }
    let cancelled = false
    getChildInterests(area.id)
      .then((items) => !cancelled && setLevel(items))
      .catch(() => !cancelled && onError('Kunde inte hämta intressena.'))
    return () => {
      cancelled = true
    }
  }, [area, onError])

  if (loadError) return <p className="status-error">{loadError}</p>

  return (
    <div className="interest-library">
      <ul className="interest-tags">
        {top.map((item) => {
          const isOpen = area?.id === item.id
          return (
            <li key={item.id}>
              {/* Huvudområdena som intressetaggar, i sin egen färg. Pilen vänds uppåt när området är öppet. */}
              <button
                type="button"
                className={`interest-tag explorer-area${isOpen ? ' explorer-area-open' : ''}`}
                style={areaColors(item.name)}
                aria-expanded={isOpen}
                onClick={() => setArea(isOpen ? null : item)}
              >
                {item.name}
                <DrawnArrow className="explorer-arrow" />
              </button>
            </li>
          )
        })}
      </ul>
      {area && (
        <div className="library-area" style={areaColors(area.name)}>
          <h3 className="library-area-title">{area.name}</h3>
          <ul className="interest-tags">
            <PickTag
              interest={area}
              area={area.name}
              label={`${area.name} (allmänt)`}
              on={selectedIds.has(area.id)}
              busy={busyId === area.id}
              onToggle={onToggle}
            />
            {level.map((item) =>
              item.has_children ? (
                <PickGroup key={item.id} interest={item} area={area.name} picked={picked} />
              ) : (
                <PickTag
                  key={item.id}
                  interest={item}
                  area={area.name}
                  on={selectedIds.has(item.id)}
                  busy={busyId === item.id}
                  onToggle={onToggle}
                />
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default InterestLibrary
