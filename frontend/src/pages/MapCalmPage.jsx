import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getBadges } from '../services/badges'
import { getEvents } from '../services/events'
import { getGroups, getMyGroups } from '../services/groups'
import { getMyInterests } from '../services/interests'
import { getProfile } from '../services/profile'
import { activitiesFrom } from './mapPrototypeActivities'
import { allKommuner } from './mapPrototypeZoomLevels'

const today = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
const eventTime = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// Så många kommande events och events i närheten står på sidan, så att den inte blir lång.
const MAX_LINES = 3
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const notOver = (event, now) => new Date(event.ends_at ?? event.starts_at).getTime() >= now
const byStart = (a, b) => new Date(a.starts_at) - new Date(b.starts_at)

// Ens bokade events: samma som "Mina events" i appen (skapat, eller svarat Ja
// eller Kanske). De som inte har tagit slut, närmast först.
function bookedEvents(events, now) {
  return events
    .filter((e) => e.is_owner || e.my_answer === 'yes' || e.my_answer === 'maybe')
    .filter((e) => notOver(e, now))
    .sort(byStart)
}

// Inbjudningar man inte har svarat på (samma som fliken Inbjudningar).
function unansweredInvitations(events, now) {
  return events.filter((e) => !e.is_owner && e.is_invited && e.my_answer === null && notOver(e, now))
}

// "I närheten den här veckan": öppna events i ens kommun som pågår någon gång de
// närmaste sju dagarna och som man varken har skapat, blivit inbjuden till eller
// svarat på. Kommunen räknas ut som på kartan (se activitiesFrom): nålen,
// klubbens kommun eller ett kommunnamn i adressen. De som har ett av ens
// intressen först, sedan närmast först.
function nearbyEvents({ events, groups, kommuner, municipalityCode, interestIds, now }) {
  const candidates = events.filter(
    (e) =>
      (e.visibility === 'open' || e.visibility === 'application') &&
      !e.is_owner &&
      !e.is_invited &&
      e.my_answer === null &&
      notOver(e, now) &&
      new Date(e.starts_at).getTime() < now + WEEK_MS,
  )
  const inMyKommun = new Set(
    activitiesFrom({ groups, events: candidates, kommuner })
      .filter((item) => item.type === 'event' && item.kommun === municipalityCode)
      .map((item) => item.id),
  )
  const nearby = candidates.filter((e) => inMyKommun.has(e.id)).sort(byStart)
  return [...nearby.filter((e) => interestIds.has(e.interest_id)), ...nearby.filter((e) => !interestIds.has(e.interest_id))]
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Att göra-läget (se MapPrototype.jsx): i stället för kartan en sida i ett
// anteckningsblock. Överst en hälsning och dagens datum, och på linjerna
// dagens att göra: de närmaste bokade eventen (och en länk till Mina events),
// obesvarade eventinbjudningar, nya brev, klubbinbjudningar och
// kompisförfrågningar. Under det "I närheten den här veckan", tips på events i
// ens kommun. Varje rad öppnar rätt block (`onOpen(sida, adress)` eller
// `onOpenEvent(id)`). Runt omkring några klotter i marginalen.
function MapCalmPage({ onOpen, onOpenEvent }) {
  const { user } = useAuth()
  const [name, setName] = useState(null)
  const [todo, setTodo] = useState(null) // null = laddar

  useEffect(() => {
    let cancelled = false
    // Siffrorna kommer i ett anrop, samma som appens märken (se useBadgeCounts).
    // Klubbarna och kommunerna behövs för att veta vilka events som är i ens kommun.
    Promise.allSettled([
      getProfile(),
      getEvents(),
      getBadges(),
      getMyInterests(),
      getGroups(),
      getMyGroups(),
      allKommuner(),
    ]).then(([profile, events, badges, interests, publicGroups, myGroups, kommuner]) => {
      if (cancelled) return
      const value = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback)
      const counts = value(badges, null)
      const me = value(profile, null)
      const allEvents = value(events, [])
      const now = Date.now()
      setName(me?.name ?? null)
      setTodo({
        booked: bookedEvents(allEvents, now),
        eventInvitations: unansweredInvitations(allEvents, now).length,
        // Utan kommunerna eller ens kommun går det inte att veta vad som är i närheten.
        nearby:
          kommuner.status === 'fulfilled' && me?.municipality_code
            ? nearbyEvents({
                events: allEvents,
                groups: [...value(publicGroups, []), ...value(myGroups, [])],
                kommuner: kommuner.value,
                municipalityCode: me.municipality_code,
                interestIds: new Set(value(interests, []).map((i) => i.id)),
                now,
              })
            : [],
        letters: counts?.unread_conversations ?? 0,
        invitations: counts?.club_invitations ?? 0,
        requests: counts?.contact_requests ?? 0,
        notifications: counts?.unread_notifications ?? 0,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const firstName = (name ?? user.username).trim().split(/\s+/)[0]

  return (
    <div className="map-calm">
      <MarginDoodles />
      <div className="map-calm-page">
        <h2 className="map-calm-hello">Hej {firstName}!</h2>
        <p className="map-calm-date">{today.format(new Date())}</p>

        <p className="map-calm-heading">Att göra idag</p>
        {todo === null ? (
          <p className="map-calm-muted">Bläddrar i blocket...</p>
        ) : (
          <>
            <ul className="map-calm-todo">
              {todo.booked.length > 0 ? (
                <>
                  {todo.booked.slice(0, MAX_LINES).map((event) => (
                    <TodoLine key={event.id} onClick={() => onOpenEvent(event.id)} done={false}>
                      <strong>{event.title}</strong>, {eventTime.format(new Date(event.starts_at))}
                    </TodoLine>
                  ))}
                  <TodoLine onClick={() => onOpen('events', '/events?flik=mina-events')} done={false}>
                    Alla mina events →
                  </TodoLine>
                </>
              ) : (
                <TodoLine onClick={() => onOpen('events')} done={false}>
                  Inga bokade events. Kika på Events?
                </TodoLine>
              )}
              {todo.eventInvitations > 0 && (
                <TodoLine onClick={() => onOpen('events', '/events?flik=inbjudningar')} done={false}>
                  Svara på {plural(todo.eventInvitations, 'eventinbjudan', 'eventinbjudningar')}
                </TodoLine>
              )}
              <TodoLine onClick={() => onOpen('brev')} done={todo.letters === 0}>
                {todo.letters > 0 ? `Läs ${plural(todo.letters, 'nytt brev', 'nya brev')}` : 'Inga nya brev'}
              </TodoLine>
              {todo.invitations > 0 && (
                <TodoLine onClick={() => onOpen('klubbar')} done={false}>
                  Svara på {plural(todo.invitations, 'klubbinbjudan', 'klubbinbjudningar')}
                </TodoLine>
              )}
              {todo.requests > 0 && (
                <TodoLine onClick={() => onOpen('personer')} done={false}>
                  {plural(todo.requests, 'person vill', 'personer vill')} bli din kompis
                </TodoLine>
              )}
              {todo.notifications > 0 && (
                <TodoLine onClick={() => onOpen('notiser')} done={false}>
                  Läs {plural(todo.notifications, 'ny notis', 'nya notiser')}
                </TodoLine>
              )}
            </ul>
            {todo.nearby.length > 0 && (
              <>
                <p className="map-calm-heading map-calm-heading-next">I närheten den här veckan</p>
                <ul className="map-calm-todo">
                  {todo.nearby.slice(0, MAX_LINES).map((event) => (
                    <TipLine key={event.id} onClick={() => onOpenEvent(event.id)}>
                      {event.title}, {eventTime.format(new Date(event.starts_at))}
                    </TipLine>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// En rad i att göra-listan: en ritad ruta (bockad när det inte finns något
// att göra) och texten, som öppnar rätt block.
function TodoLine({ onClick, done, children }) {
  return (
    <li>
      <button type="button" className={`map-calm-line${done ? ' is-done' : ''}`} onClick={onClick}>
        <svg className="map-calm-box" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 4 L17 3 L16.5 17 L3.5 16.5 Z" />
          {done && <path className="map-calm-check" d="M5.5 10 L9 14 L18 1" />}
        </svg>
        <span>{children}</span>
      </button>
    </li>
  )
}

// En rad under "I närheten den här veckan": ett tips, inte något man måste
// göra, så en ritad punkt i stället för en ruta. Öppnar eventet.
function TipLine({ onClick, children }) {
  return (
    <li>
      <button type="button" className="map-calm-line" onClick={onClick}>
        <svg className="map-calm-box" viewBox="0 0 20 20" aria-hidden="true">
          <path className="map-calm-dot" d="M10 7.5 C12 7, 13 9, 12.5 10.5 C12 12.5, 9 13, 8 11.5 C7 10, 8 7.8, 10 7.5 Z" />
        </svg>
        <span>{children}</span>
      </button>
    </li>
  )
}

// Klotter i marginalerna, i samma bläck som resten av kartan: en kaffefläck,
// ett pappersflygplan med sin streckade bana, stjärnor och en blomma. Bara
// pynt, så de läses inte upp.
function MarginDoodles() {
  return (
    <div className="map-calm-doodles" aria-hidden="true">
      {/* Utspillt kaffe nere till höger, ritat efter foton av riktiga fläckar:
          en oregelbunden pöl med lober och en torr ö, en tunn mörkare kant där
          kaffet torkade, en fläckig, genomskinlig insida, droppar runt om och
          en svag äldre ring från koppen. Bruset (feTurbulence) gör kanterna
          ojämna och insidan fläckig. */}
      <svg className="map-calm-coffee" viewBox="-110 -110 220 220">
        <defs>
          <filter id="map-calm-coffee-edge" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.13" numOctaves="3" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="6" />
          </filter>
          <filter id="map-calm-coffee-mottle" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="11" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -0.9" result="spots" />
            <feComposite in="SourceGraphic" in2="spots" operator="in" />
          </filter>
          <path
            id="map-calm-coffee-puddle"
            fillRule="evenodd"
            d="M-44 -72 C-30 -80 -8 -78 2 -66 C10 -56 4 -44 12 -36 C18 -30 28 -34 36 -28 C44 -22 58 -30 66 -20 C74 -10 66 0 72 8 C80 18 92 16 92 28 C92 38 80 38 78 46 C76 56 84 64 74 70 C62 78 52 66 42 70 C30 74 26 84 14 80 C2 76 6 64 -6 60 C-14 58 -18 66 -28 64 C-40 62 -44 72 -56 76 C-66 80 -78 84 -82 78 C-86 72 -74 66 -66 60 C-58 54 -62 44 -58 36 C-54 26 -44 26 -46 14 C-48 2 -60 -6 -60 -20 C-60 -34 -54 -40 -58 -52 C-62 -64 -54 -68 -44 -72 Z M-22 -50 C-10 -56 0 -46 -4 -36 C-8 -26 -20 -24 -27 -32 C-33 -40 -31 -46 -22 -50 Z"
          />
        </defs>
        {/* Den äldre ringen, svag och bara till hälften kvar. */}
        <path className="map-calm-coffee-old" d="M-96 -20 A44 44 0 0 1 -30 -96" filter="url(#map-calm-coffee-edge)" />
        <g filter="url(#map-calm-coffee-edge)">
          <use href="#map-calm-coffee-puddle" className="map-calm-coffee-fill" />
          <use href="#map-calm-coffee-puddle" className="map-calm-coffee-spots" filter="url(#map-calm-coffee-mottle)" />
          <use href="#map-calm-coffee-puddle" className="map-calm-coffee-band" />
          <use href="#map-calm-coffee-puddle" className="map-calm-coffee-rim" />
          {[
            [58, -50, 6, 5],
            [82, -34, 3, 3],
            [-74, -62, 4, 3.5],
            [100, 52, 4.5, 4],
            [-94, 88, 3, 2.6],
            [30, 94, 3.5, 3],
            [-40, 88, 2, 2],
            [70, 90, 1.6, 1.6],
            [-80, 10, 2.2, 2],
          ].map(([cx, cy, rx, ry]) => (
            <ellipse key={`${cx},${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} className="map-calm-coffee-drop" />
          ))}
        </g>
      </svg>
      {/* Pappersflygplanet uppe till höger, med en loop bakom sig. */}
      <svg className="map-calm-plane" viewBox="-265 0 270 75">
        <path className="map-calm-plane-path" d="M-260 66 C-200 6, -150 106, -120 56 S-82 4, -44 30" />
        <g className="map-calm-plane-body">
          <path d="M-40 30 L0 10 L-24 44 Z" />
          <path d="M0 10 L-30 34 L-26 50" />
        </g>
      </svg>
      {/* Stjärnor och en blomma. */}
      <svg className="map-calm-star" viewBox="-10 -10 20 20">
        <path d="M0 -9 L2.5 -2.5 L9 -2 L4 2.5 L5.5 9 L0 5.5 L-5.5 9 L-4 2.5 L-9 -2 L-2.5 -2.5 Z" />
      </svg>
      <svg className="map-calm-star is-second" viewBox="-10 -10 20 20">
        <path d="M0 -9 L2.5 -2.5 L9 -2 L4 2.5 L5.5 9 L0 5.5 L-5.5 9 L-4 2.5 L-9 -2 L-2.5 -2.5 Z" />
      </svg>
      <svg className="map-calm-flower" viewBox="-22 -22 44 95">
        <path d="M0 -6 C-8 -20, 8 -20, 0 -6 M6 0 C20 -8, 20 8, 6 0 M0 6 C8 20, -8 20, 0 6 M-6 0 C-20 8, -20 -8, -6 0" />
        <circle cx="0" cy="0" r="4" />
        <path d="M0 22 C2 40, -4 52, 0 70" />
      </svg>
    </div>
  )
}

export default MapCalmPage
