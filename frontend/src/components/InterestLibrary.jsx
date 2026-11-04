import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { getChildInterests, getTopInterests } from '../services/interests'
import { areaColors } from '../utils/interestColors'
import CheckMark from './CheckMark'
import DrawnArrow from './DrawnArrow'
import InterestTagPanel from './InterestTagPanel'
import LoadError, { useRetry } from './LoadError'

// Ett tryck på ett intresse som inte är valt öppnar rutan om det (`onInfo`, se InterestInfo) när den finns, annars
// läggs det till direkt. Ett valt intresse tas bort med `onToggle`, utan rutan (SCRUM-306).
const pick = (interest, on, onToggle, onInfo) => (on || !onInfo ? onToggle(interest) : onInfo(interest))

// Ett intresse att trycka på: en intressetagg i huvudområdets färg (`areaSlug`, se utils/interestColors.js). Inte valt:
// den ljusa nyansen och +. Valt: områdets färg, ✓, fetstil och nedtryckt. `title` (valfri) syns när man håller över,
// t.ex. var en sökträff hör hemma. Vad ett tryck gör, se pick ovan.
export function PickTag({ interest, areaSlug, label = interest.name, title, on, busy, onToggle, onInfo }) {
  return (
    <li>
      <button
        type="button"
        className={`interest-tag interest-pick${on ? ' is-on' : ''}`}
        style={areaColors(areaSlug)}
        title={title}
        aria-pressed={on}
        aria-haspopup={!on && onInfo ? 'dialog' : undefined}
        disabled={busy}
        onClick={() => pick(interest, on, onToggle, onInfo)}
      >
        <span className="interest-pick-mark" aria-hidden="true">
          {on ? <CheckMark /> : '+'}
        </span>
        {label}
      </button>
    </li>
  )
}

// Ett intresse med underintressen: taggen fungerar som PickTag, och pilen i den lägger
// underintressena i en ruta över taggarna under (samma som på profilens taggar, se
// InterestTagPanel). Rutan stängs med pilen, ett tryck utanför eller Esc, och när rutan
// om ett intresse öppnas, så att den aldrig hamnar under underintressena.
function PickGroup({ interest, areaSlug, picked }) {
  const [open, setOpen] = useState(false)
  const [kids, setKids] = useState(null) // null = inte hämtade än
  const close = useCallback(() => setOpen(false), [])
  const rootRef = useRef(null)
  const panelId = useId()
  useDismiss(rootRef, open, close)

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
  const onInfo =
    picked.onInfo &&
    ((chosen) => {
      close()
      picked.onInfo(chosen)
    })
  return (
    <li ref={rootRef} className={`interest-tag-group${open ? ' is-open' : ''}`} style={areaColors(areaSlug)}>
      <span className={`interest-tag interest-pick interest-pick-group${on ? ' is-on' : ''}`}>
        <button
          type="button"
          className="interest-pick-toggle"
          aria-pressed={on}
          aria-haspopup={!on && onInfo ? 'dialog' : undefined}
          disabled={picked.busyId === interest.id}
          onClick={() => pick(interest, on, picked.onToggle, onInfo)}
        >
          <span className="interest-pick-mark" aria-hidden="true">
            {on ? <CheckMark /> : '+'}
          </span>
          {interest.name}
        </button>
        <button
          type="button"
          className="interest-pick-drill"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Dölj' : 'Visa'} intressen under ${interest.name}`}
          onClick={() => setOpen(!open)}
        >
          <DrawnArrow className="interest-tag-arrow" />
        </button>
      </span>
      {open && kids && (
        <InterestTagPanel id={panelId}>
          {kids.map((kid) => (
            <PickTag
              key={kid.id}
              interest={kid}
              areaSlug={areaSlug}
              on={picked.selectedIds.has(kid.id)}
              busy={picked.busyId === kid.id}
              onToggle={picked.onToggle}
              onInfo={onInfo}
            />
          ))}
        </InterestTagPanel>
      )}
    </li>
  )
}

// Intressebiblioteket som taggar: huvudområdena (Utforska), och ett tryck öppnar
// området i en ruta i dess färg, direkt under raden med taggen, med intressena som
// taggar att trycka på. Området självt går också att välja ("(allmänt)"). Har ett
// intresse underintressen öppnar pilen i taggen dem (PickGroup). Biblioteket har tre
// nivåer (område › intresse › mer specifikt).
// `selectedIds` är de valda, `busyId` det som sparas just nu, `onToggle(interest)`
// lägger till eller tar bort och `onError(text)` visar ett fel. Med `onInfo(interest)`
// öppnar ett tryck på ett intresse som inte är valt rutan om det (se PickTag).
function InterestLibrary({ selectedIds, busyId, onToggle, onError, onInfo }) {
  const [top, setTop] = useState([])
  const [loadError, setLoadError] = useState('')
  const [area, setArea] = useState(null) // det öppna området
  const [level, setLevel] = useState([])
  const picked = { selectedIds, busyId, onToggle, onError, onInfo }
  const [attempt, retry] = useRetry()
  const listRef = useRef(null)
  // Sista taggen på samma rad som det öppna området: rutan läggs efter den, så att den hamnar under raden.
  const [rowEnd, setRowEnd] = useState(null)
  const openIndex = area ? top.findIndex((item) => item.id === area.id) : -1

  useLayoutEffect(() => {
    if (openIndex < 0) return undefined
    const list = listRef.current
    function place() {
      const tags = [...list.children].filter((li) => !li.classList.contains('library-area-row'))
      const row = tags[openIndex].offsetTop
      let end = openIndex
      while (end + 1 < tags.length && tags[end + 1].offsetTop === row) end++
      setRowEnd(end)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(list)
    return () => observer.disconnect()
  }, [openIndex])

  // En ruta högre upp stängs när man öppnar ett område längre ner, och då flyttar sig taggen. Håll den i bild.
  useEffect(() => {
    if (openIndex >= 0) listRef.current.children[openIndex]?.querySelector('button')?.scrollIntoView({ block: 'nearest' })
  }, [openIndex])

  useEffect(() => {
    setLoadError('')
    getTopInterests()
      .then(setTop)
      .catch(() => setLoadError('Kunde inte hämta intressena.'))
  }, [attempt])

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

  if (loadError) return <LoadError text={loadError} onRetry={retry} />

  return (
    <div className="interest-library">
      <ul className="interest-tags" ref={listRef}>
        {top.map((item, index) => {
          const isOpen = area?.id === item.id
          return (
            <Fragment key={item.id}>
              <li>
                {/* Huvudområdena som intressetaggar, i sin egen färg. Pilen pekar nedåt när området är öppet. */}
                <button
                  type="button"
                  className={`interest-tag explorer-area${isOpen ? ' explorer-area-open' : ''}`}
                  style={areaColors(item.area_slug)}
                  aria-expanded={isOpen}
                  onClick={() => setArea(isOpen ? null : item)}
                >
                  {item.name}
                  <DrawnArrow className="explorer-arrow" />
                </button>
              </li>
              {area && index === (rowEnd ?? openIndex) && (
                <li className="library-area-row">
                  <div className="library-area" style={areaColors(area.area_slug)}>
                    <h3 className="library-area-title">{area.name}</h3>
                    <ul className="interest-tags">
                      <PickTag
                        interest={area}
                        areaSlug={area.area_slug}
                        label={`${area.name} (allmänt)`}
                        on={selectedIds.has(area.id)}
                        busy={busyId === area.id}
                        onToggle={onToggle}
                        onInfo={onInfo}
                      />
                      {level.map((sub) =>
                        sub.has_children ? (
                          <PickGroup key={sub.id} interest={sub} areaSlug={area.area_slug} picked={picked} />
                        ) : (
                          <PickTag
                            key={sub.id}
                            interest={sub}
                            areaSlug={area.area_slug}
                            on={selectedIds.has(sub.id)}
                            busy={busyId === sub.id}
                            onToggle={onToggle}
                            onInfo={onInfo}
                          />
                        ),
                      )}
                    </ul>
                  </div>
                </li>
              )}
            </Fragment>
          )
        })}
      </ul>
    </div>
  )
}

export default InterestLibrary
