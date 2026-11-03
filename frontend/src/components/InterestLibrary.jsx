import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDismiss } from '../hooks/useDismiss'
import { getChildInterests, getTopInterests } from '../services/interests'
import { areaColors } from '../utils/interestColors'
import { interestPageHref } from '../utils/interestGroups'
import CheckMark from './CheckMark'
import DrawnArrow from './DrawnArrow'
import InterestTagPanel from './InterestTagPanel'
import LoadError, { useRetry } from './LoadError'

// Ett intresse att trycka på för att lägga till eller ta bort det: en intressetagg
// i huvudområdets färg (`areaSlug`, se utils/interestColors.js). Inte valt: den ljusa nyansen och +. Valt:
// områdets färg, ✓, fetstil och nedtryckt. `title` (valfri) syns när man håller
// över, t.ex. var en sökträff hör hemma. Med `linkPage` har taggen en liten rund › som öppnar intressets sida
// (SCRUM-306); resten av taggen väljer som vanligt.
export function PickTag({ interest, areaSlug, label = interest.name, title, on, busy, onToggle, linkPage = false }) {
  const mark = (
    <span className="interest-pick-mark" aria-hidden="true">
      {on ? <CheckMark /> : '+'}
    </span>
  )
  if (linkPage) {
    return (
      <li style={areaColors(areaSlug)}>
        <span className={`interest-tag interest-pick interest-pick-group${on ? ' is-on' : ''}`} title={title}>
          <button
            type="button"
            className="interest-pick-toggle"
            aria-pressed={on}
            disabled={busy}
            onClick={() => onToggle(interest)}
          >
            {mark}
            {label}
          </button>
          <PageLink interest={interest} />
        </span>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className={`interest-tag interest-pick${on ? ' is-on' : ''}`}
        style={areaColors(areaSlug)}
        title={title}
        aria-pressed={on}
        disabled={busy}
        onClick={() => onToggle(interest)}
      >
        {mark}
        {label}
      </button>
    </li>
  )
}

// Den lilla runda › i en tagg, som öppnar intressets sida.
function PageLink({ interest }) {
  return (
    <Link to={interestPageHref(interest.id)} className="interest-pick-page" aria-label={`Om ${interest.name}`}>
      <span aria-hidden="true">›</span>
    </Link>
  )
}

// Ett intresse med underintressen: taggen går att välja, och pilen i den öppnar
// en ruta under taggen med underintressena, eller ett ark nedifrån på en smal skärm
// (samma som på profilens taggar, se InterestTagPanel). Rutan stängs med pilen, ett
// tryck utanför eller Esc. Länken till intressets sida står överst i rutan, så att
// taggen inte får tre knappar.
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
  return (
    <li ref={rootRef} className={`interest-tag-group${open ? ' is-open' : ''}`} style={areaColors(areaSlug)}>
      <span className={`interest-tag interest-pick interest-pick-group${on ? ' is-on' : ''}`}>
        <button
          type="button"
          className="interest-pick-toggle"
          aria-pressed={on}
          disabled={picked.busyId === interest.id}
          onClick={() => picked.onToggle(interest)}
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
        <InterestTagPanel
          id={panelId}
          title={interest.name}
          pageHref={picked.linkPages ? interestPageHref(interest.id) : null}
          onClose={close}
        >
          {kids.map((kid) => (
            <PickTag
              key={kid.id}
              interest={kid}
              areaSlug={areaSlug}
              on={picked.selectedIds.has(kid.id)}
              busy={picked.busyId === kid.id}
              onToggle={picked.onToggle}
              linkPage={picked.linkPages}
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
// lägger till eller tar bort och `onError(text)` visar ett fel. Med `linkPages` går
// det att öppna intressenas sidor (se PickTag och PickGroup).
function InterestLibrary({ selectedIds, busyId, onToggle, onError, linkPages = false }) {
  const [top, setTop] = useState([])
  const [loadError, setLoadError] = useState('')
  const [area, setArea] = useState(null) // det öppna området
  const [level, setLevel] = useState([])
  const picked = { selectedIds, busyId, onToggle, onError, linkPages }
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
                        linkPage={linkPages}
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
                            linkPage={linkPages}
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
