import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getContacts } from '../services/contacts'
import { getEvents } from '../services/events'
import { getGroupInvitationCount } from '../services/groups'
import { countUnseenConversations, getConversations } from '../services/messages'
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

// Lugnt läge (se MapPrototype.jsx): i stället för kartan en sida i ett
// anteckningsblock. Överst en hälsning och dagens datum, och på linjerna
// dagens att göra: nästa bokade event, nya brev, klubbinbjudningar och
// kontaktförfrågningar. Varje rad öppnar rätt block (`onOpen(sida)` eller
// `onOpenEvent(id)`). Runt omkring några klotter i marginalen.
function MapCalmPage({ onOpen, onOpenEvent, onShowMap }) {
  const { user } = useAuth()
  const [name, setName] = useState(null)
  const [todo, setTodo] = useState(null) // null = laddar

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([getProfile(), getEvents(), getConversations(), getGroupInvitationCount(), getContacts()]).then(
      ([profile, events, conversations, invitations, contacts]) => {
        if (cancelled) return
        const value = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback)
        setName(value(profile, null)?.name ?? null)
        setTodo({
          event: nextBookedEvent(value(events, [])),
          letters: countUnseenConversations(value(conversations, [])),
          invitations: value(invitations, 0),
          requests: value(contacts, null)?.incoming_requests?.length ?? 0,
        })
      },
    )
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

        <p className="map-calm-paused">Kartan är pausad.</p>
        <button type="button" className="map-tool" onClick={onShowMap}>
          Visa kartan
        </button>
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
      {/* Kaffefläcken nere till höger: en torkad ring med mörkare, ojämn kant
          och ljusare insida, en svagare ring där koppen stod först och några
          stänk. Bruset (feTurbulence) gör kanterna ojämna som på riktigt. */}
      <svg className="map-calm-coffee" viewBox="-70 -70 140 140">
        <defs>
          <radialGradient id="map-calm-coffee-ring">
            <stop offset="0.62" stopColor="#8a5a2b" stopOpacity="0.06" />
            <stop offset="0.8" stopColor="#8a5a2b" stopOpacity="0.14" />
            <stop offset="0.9" stopColor="#6b3f1a" stopOpacity="0.42" />
            <stop offset="0.95" stopColor="#5a3314" stopOpacity="0.55" />
            <stop offset="1" stopColor="#5a3314" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="map-calm-coffee-faint">
            <stop offset="0.86" stopColor="#6b3f1a" stopOpacity="0" />
            <stop offset="0.94" stopColor="#6b3f1a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#6b3f1a" stopOpacity="0" />
          </radialGradient>
          <filter id="map-calm-coffee-wobble" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="6" />
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
          {/* Bara ungefär två tredjedelar av den första ringen syns. */}
          <mask id="map-calm-coffee-part">
            <rect x="-70" y="-70" width="140" height="140" fill="black" />
            <path d="M-70 -70 L70 -70 L70 20 L-20 70 L-70 70 Z" fill="white" />
          </mask>
        </defs>
        <g filter="url(#map-calm-coffee-wobble)">
          <circle cx="9" cy="-7" r="50" fill="url(#map-calm-coffee-faint)" mask="url(#map-calm-coffee-part)" />
          <circle cx="0" cy="0" r="52" fill="url(#map-calm-coffee-ring)" />
          <circle cx="-54" cy="34" r="3.2" className="map-calm-coffee-drop" />
          <circle cx="-61" cy="41" r="1.8" className="map-calm-coffee-drop" />
          <circle cx="47" cy="-46" r="2.2" className="map-calm-coffee-drop" />
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
