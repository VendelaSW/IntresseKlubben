import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { useDesignChoice } from '../hooks/useDesignChoice'
import { groupInterests } from '../utils/interestGroups'
import { posterStrip } from '../utils/matchPoster'
import InterestTags from './InterestTags'

// Så många rader intressetaggar syns på kortet. Fler fälls ut med ⋯.
const MAX_ROWS = 2

// Intressena på ett personkort: de gemensamma först, och så många som får plats
// hela på MAX_ROWS rader. Har personen fler visar en ⋯-tagg alla i en ruta som
// fälls ut över kortet, så att man slipper gå in på profilen. Rutan stängs med
// ⋯ igen, ett klick utanför eller Esc.
function CardInterests({ interests, sharedIds }) {
  const [open, setOpen] = useState(false)
  // Hur många taggar som får plats. Räknas ner tills de (med ⋯) ryms på
  // MAX_ROWS rader, och börjar om med alla när kortet ändrar bredd.
  const [count, setCount] = useState(Infinity)
  const boxRef = useRef(null)
  const rowRef = useRef(null)
  const panelId = useId()
  const groups = groupInterests(interests)
  const isShared = (group) => [group.key, ...group.subs.map((sub) => sub.key)].some((id) => sharedIds?.has(id))
  const ordered = [...groups.filter(isShared), ...groups.filter((group) => !isShared(group))]

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const rows = new Set([...row.children].map((item) => item.offsetTop)).size
    const shown = Math.min(count, ordered.length)
    if (shown > 1 && (rows > MAX_ROWS || row.scrollWidth > row.clientWidth + 1)) setCount(shown - 1)
  }, [count, interests, ordered.length])

  useEffect(() => {
    let width = boxRef.current?.offsetWidth
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return
      width = entry.contentRect.width
      setCount(Infinity)
    })
    observer.observe(boxRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !boxRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className={`person-card-interests${open ? ' is-open' : ''}${count === 1 ? ' is-tight' : ''}`} ref={boxRef}>
      <InterestTags listRef={rowRef} groups={ordered.slice(0, count)} highlight={sharedIds}>
        {ordered.length > count && (
          <button
            type="button"
            className="interest-tag interest-tag-more"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? 'Dölj alla intressen' : `Visa alla ${interests.length} intressen`}
            onClick={() => setOpen(!open)}
          >
            ⋯
          </button>
        )}
      </InterestTags>
      {open && (
        <div id={panelId} className="person-card-interests-all">
          <InterestTags groups={ordered} highlight={sharedIds} />
        </div>
      )}
    </div>
  )
}

// Ett kort för en annan användare. Avatar, namn och plats länkar till
// personens skrivskyddade profil. Åtgärdsknapparna (skicka/acceptera/ta
// bort) skickas in via `actions` och ligger utanför länken, så de inte
// hamnar nästlade i en <a> (ogiltig HTML och krockande klick).
// `sharedInterestIds` är valfri (en Set) och markerar gemensamma intressen.
// `reason` är valfri: en kort förklaring till varför personen föreslås,
// t.ex. "Ni har 2 gemensamma intressen" (text eller JSX). Intressena visas
// på en rad, se CardInterests.
// Fem valfria delar för kort som bygger vidare på det här (se MatchCard): `className` läggs
// till på kortet, `style` är CSS-variabler på kortet, `badge` är något som sitter på kortets kant
// (t.ex. nivån), `intro` står mellan namnet och intressena och `place` är en annan text än stadsdel och kommun
// (null döljer raden).
// TILLFÄLLIGT (testläget): i layouten Nicklas förslag 1 (väljaren "Matchningssidan") har alla personkort samma affischstil som
// matchningskortet (.match-card-poster): vitt papper utan kant, en färgad rad överst, namnet i tryckbokstäver och orten i en
// svart ruta. `poster` tvingar den på eller av (MatchCard stänger av den, eftersom den har sin egen).
function PersonCard({ person, sharedInterestIds, reason, actions, className, style, badge, intro, place: placeText, poster }) {
  const layout = useDesignChoice('matchLayout')
  const isPoster = poster ?? layout === 'nicklas-1'
  // Kompisar/förfrågningar har bara username garanterat (inget namn valt än).
  const displayName = person.name ?? person.username
  const place =
    placeText !== undefined
      ? placeText
      : isPoster
        ? person.municipality_name // affischen visar bara staden
        : [person.district, person.municipality_name].filter(Boolean).join(', ')
  const [posterColor, posterStops] = isPoster ? posterStrip(person.interests, sharedInterestIds) : []

  return (
    <article
      className={`card card-interactive person-card${isPoster ? ' match-card-poster person-card-poster' : ''}${className ? ` ${className}` : ''}`}
      style={isPoster ? { '--poster': posterColor, '--poster-strip': posterStops, ...style } : style}
    >
      {badge}
      <Link to={`/anvandare/${person.id}`} className="person-card-link">
        <Avatar name={displayName} imageUrl={person.image_url} className="card-avatar" maxLetters={2} />
        <p className="card-title">
          {displayName}
          {person.age ? `, ${person.age}` : ''}
          {/* Bara moderatorer ser en dold ålder (SCRUM-134), och då med en markering. */}
          {person.age && person.age_hidden ? <span className="hint-text"> (dold för andra)</span> : null}
        </p>
        {place && <p className="card-subheading">{place}</p>}
      </Link>
      {intro}
      {reason && <p className="hint-text">{reason}</p>}
      {person.interests?.length > 0 && <CardInterests interests={person.interests} sharedIds={sharedInterestIds} />}
      {actions}
    </article>
  )
}

export default PersonCard
