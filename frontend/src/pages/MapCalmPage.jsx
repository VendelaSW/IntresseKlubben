import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getBadges } from '../services/badges'
import { getEvents } from '../services/events'
import { countUnseenConversations } from '../services/messages'
import { getProfile } from '../services/profile'

const today = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
const eventTime = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// Ens bokade events: samma som "Mina events" i appen (skapat, eller svarat Ja
// eller Kanske). Det närmaste som inte har tagit slut, eller null.
function nextBookedEvent(events) {
  const now = Date.now()
  return (
    events
      .filter((e) => e.is_owner || e.my_answer === 'yes' || e.my_answer === 'maybe')
      .filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0] ?? null
  )
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Att göra-läget (se MapPrototype.jsx): i stället för kartan en sida i ett
// anteckningsblock. Överst en hälsning och dagens datum, och på linjerna
// dagens att göra: nästa bokade event, nya brev, klubbinbjudningar och
// kontaktförfrågningar. Varje rad öppnar rätt block (`onOpen(sida)` eller
// `onOpenEvent(id)`). Runt omkring några klotter i marginalen.
function MapCalmPage({ onOpen, onOpenEvent }) {
  const { user } = useAuth()
  const [name, setName] = useState(null)
  const [todo, setTodo] = useState(null) // null = laddar

  useEffect(() => {
    let cancelled = false
    // Siffrorna kommer i ett anrop, samma som appens märken (se useBadgeCounts).
    Promise.allSettled([getProfile(), getEvents(), getBadges()]).then(([profile, events, badges]) => {
      if (cancelled) return
      const value = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback)
      const counts = value(badges, null)
      setName(value(profile, null)?.name ?? null)
      setTodo({
        event: nextBookedEvent(value(events, [])),
        letters: countUnseenConversations(counts?.conversations ?? []),
        invitations: counts?.club_invitations ?? 0,
        requests: counts?.contact_requests ?? 0,
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
          <ul className="map-calm-todo">
            {todo.event ? (
              <TodoLine onClick={() => onOpenEvent(todo.event.id)} done={false}>
                Nästa event: <strong>{todo.event.title}</strong>, {eventTime.format(new Date(todo.event.starts_at))}
              </TodoLine>
            ) : (
              <TodoLine onClick={() => onOpen('events')} done={false}>
                Inga bokade events. Kika på Events?
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
                {plural(todo.requests, 'person vill', 'personer vill')} bli din kontakt
              </TodoLine>
            )}
          </ul>
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
