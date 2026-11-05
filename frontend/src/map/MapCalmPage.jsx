import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useIsMobile } from '../hooks/useMediaQuery'
import { contactsQuery } from '../services/contacts'
import { getEvents } from '../services/events'
import { getAllGroups, getGroupsOverview, getMyGroups, groupsOverviewQuery } from '../services/groups'
import { getMyInterests } from '../services/interests'
import { conversationsQuery } from '../services/messages'
import { notificationsQuery } from '../services/notifications'
import { getProfile } from '../services/profile'
import { queryClient } from '../services/queryClient'
import { activitiesFrom } from './activities'
import { allKommuner } from './zoomLevels'

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
const startsThisWeek = (event, now) => new Date(event.starts_at).getTime() < now + WEEK_MS
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

// De bokade eventen som visas: de som pågår eller börjar de närmaste sju dagarna (SCRUM-333). Resten finns under Mina
// events.
const bookedThisWeek = (booked, now) => booked.filter((e) => startsThisWeek(e, now))

// "I närheten den här veckan": öppna events i ens kommun som pågår någon gång de
// närmaste sju dagarna och som man varken har skapat, blivit inbjuden till eller
// svarat på. Kommunen räknas ut som på kartan (se activitiesFrom): nålen,
// klubbens kommun eller ett kommunnamn i adressen. De som har ett av ens
// intressen först, sedan närmast först. Med `anyTime` gäller alla kommande events.
function nearbyEvents({ events, groups, kommuner, municipalityCode, interestIds, now, anyTime = false }) {
  const candidates = events.filter(
    (e) =>
      (e.visibility === 'open' || e.visibility === 'application') &&
      !e.is_owner &&
      !e.is_invited &&
      e.my_answer === null &&
      notOver(e, now) &&
      (anyTime || startsThisWeek(e, now)),
  )
  const inMyKommun = new Set(
    activitiesFrom({ groups, events: candidates, kommuner })
      .filter((item) => item.type === 'event' && item.kommun === municipalityCode)
      .map((item) => item.id),
  )
  const nearby = candidates.filter((e) => inMyKommun.has(e.id)).sort(byStart)
  return [...nearby.filter((e) => interestIds.has(e.interest_id)), ...nearby.filter((e) => !interestIds.has(e.interest_id))]
}

// "Förslag för dig" (SCRUM-218): när det inte finns något annat på sidan. Högst MAX_LINES rader: de klubbar som passar
// bäst (ordningen kommer från GET /groups/overview: närmast först, sedan det intresse som ligger närmast ens egna), och
// kommande events i ens kommun för ens egna intressen. Varje rad säger varför den föreslås.
function suggestionsForYou({ clubs, events, interestIds }) {
  const reason = (id, name) => (interestIds.has(id) ? `du gillar ${name}` : 'nära dina intressen')
  const clubLines = clubs
    .filter((club) => !club.is_full)
    .slice(0, 2)
    .map((club) => ({
      key: `klubb-${club.id}`,
      club,
      why: reason(club.interest_id, club.interest_name),
    }))
  const eventLines = events
    .filter((event) => interestIds.has(event.interest_id))
    .slice(0, MAX_LINES - clubLines.length)
    .map((event) => ({
      key: `event-${event.id}`,
      event,
      why: reason(event.interest_id, event.interest_name),
    }))
  return [...clubLines, ...eventLines]
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Att göra-läget (se MapPage.jsx): i stället för kartan en sida i ett anteckningsblock. Överst en hälsning och dagens
// datum, och på linjerna under egna rubriker: "Dina events", de närmaste bokade eventen den här veckan (och en länk
// till Mina events); "Väntar på dig", obesvarade inbjudningar, kompisförfrågningar, nya brev och notiser (en ensam
// öppnas direkt, se openWaiting); och "I närheten den här veckan", tips på events i ens kommun ("I närheten framöver"
// med de som kommer senare när inget händer den här veckan). De tre står alltid kvar, med en rad vidare när de är
// tomma (I närheten ber om kommunen när profilen saknar den). "Förslag för dig" visas när sidan annars är tom. Varje
// rad öppnar rätt block (`onOpen(sida, adress)` eller `onOpenEvent(id)`). Längst ner en länk till
// integritetsinformationen (på dator under Intressekompisen i stället), och runt omkring några klotter i marginalen.
//
// `counts` är siffrorna från useBadgeCounts (i MapPage, samma som lapparna), så att "Läs 2 nya brev" blir "Läs 1 nytt
// brev" så fort man har läst ett, utan att sidan hämtas om. Eventen hämtas om när ett block stängs (`refreshKey` blir
// null igen), eftersom man kan ha svarat på en inbjudan eller anmält sig i det.
function MapCalmPage({ counts, refreshKey, onOpen, onOpenEvent }) {
  const { user } = useAuth()
  const mobile = useIsMobile()
  const [name, setName] = useState(null)
  const [todo, setTodo] = useState(null) // null = laddar
  const loaded = useRef(false)
  // En rad under Väntar på dig som letar upp sin enda sak (se openWaiting): fler tryck under tiden gör ingenting.
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    // Ett block som öppnas ändrar inget här; det räcker att hämta om när det stängs.
    if (refreshKey !== null && loaded.current) return undefined
    let cancelled = false
    // Klubbarna och kommunerna behövs för att veta vilka events som är i ens kommun.
    Promise.allSettled([
      getProfile(),
      getEvents(),
      getMyInterests(),
      // Ur det delade minnet: kartan har oftast redan hämtat dem (SCRUM-276).
      getAllGroups(),
      getMyGroups(),
      allKommuner(),
      getGroupsOverview(),
    ]).then(([profile, events, interests, publicGroups, myGroups, kommuner, overview]) => {
      if (cancelled) return
      const value = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback)
      const me = value(profile, null)
      const allEvents = value(events, [])
      const now = Date.now()
      const booked = bookedEvents(allEvents, now)
      const interestIds = new Set(value(interests, []).map((i) => i.id))
      // Utan kommunerna eller ens kommun går det inte att veta vad som är i närheten.
      const knowsKommun = kommuner.status === 'fulfilled' && Boolean(me?.municipality_code)
      const nearbyFrom = (anyTime) =>
        knowsKommun
          ? nearbyEvents({
              events: allEvents,
              groups: [...value(publicGroups, []), ...value(myGroups, [])],
              kommuner: kommuner.value,
              municipalityCode: me.municipality_code,
              interestIds,
              now,
              anyTime,
            })
          : []
      // Alla kommande i ens kommun, närmast först: de som visas när inget händer den här veckan.
      const nearbyAnyTime = nearbyFrom(true)
      setName(me?.name ?? null)
      loaded.current = true
      setTodo({
        booked: bookedThisWeek(booked, now),
        hasBookedLater: booked.length > 0,
        eventInvitations: unansweredInvitations(allEvents, now),
        // Saknas profilens kommun ber sidan om den, eftersom den är det enda som styr vad som är i närheten.
        hasKommun: me === null || Boolean(me.municipality_code),
        nearby: nearbyFrom(false),
        nearbyLater: [...nearbyAnyTime].sort(byStart),
        suggestions: suggestionsForYou({
          clubs: value(overview, null)?.suggested ?? [],
          events: nearbyAnyTime,
          interestIds,
        }),
      })
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const firstName = (name ?? user.username).trim().split(/\s+/)[0]
  const letters = counts?.unseenMessages ?? 0
  const invitations = counts?.clubInvitations ?? 0
  const requests = counts?.contactRequests ?? 0
  const notifications = counts?.notifications ?? 0
  const eventInvitations = todo?.eventInvitations.length ?? 0
  // Hur mycket som väntar på en (inbjudningar, kompisförfrågningar, brev och notiser).
  const waiting = todo === null ? 0 : eventInvitations + invitations + requests + letters + notifications

  // Väntar det bara en sak av ett slag går raden direkt till den (brevet, notisen, klubben, personen), annars till
  // listan där de står. Den enda letas upp när man trycker, med färsk data, så att det blir rätt också om något har
  // hänt sedan sidan hämtades. Hittas den inte öppnas listan.
  async function openWaiting(page, count, listPath, findPath) {
    if (opening) return
    let path = null
    if (count === 1) {
      setOpening(true)
      try {
        path = await findPath()
      } catch {
        // Listan i stället.
      } finally {
        setOpening(false)
      }
    }
    onOpen(page, path ?? listPath)
  }
  const fresh = (query) => queryClient.fetchQuery({ ...query, staleTime: 0 })

  // I närheten: den här veckan, annars det som händer längre fram (och då en annan rubrik).
  const nearbyLines = todo === null ? [] : todo.nearby.length > 0 ? todo.nearby : todo.nearbyLater
  const laterOnly = todo !== null && todo.nearby.length === 0 && nearbyLines.length > 0
  const nearbyHeading = laterOnly ? 'I närheten framöver' : 'I närheten den här veckan'

  // Siffrorna (counts) kan komma efter eventen. Innan dess står inget under Väntar på dig, så att "Inget som väntar"
  // inte blinkar till.
  const countsReady = counts !== null

  // Förslagen bara när det inte finns något annat på sidan, så att den inte blir full (SCRUM-218).
  const nothingAtAll =
    todo !== null && countsReady && todo.booked.length === 0 && nearbyLines.length === 0 && waiting === 0

  return (
    <div className="map-calm">
      <MarginDoodles />
      <div className="map-calm-page">
        <h2 className="map-calm-hello">Hej {firstName}!</h2>
        <p className="map-calm-date">{today.format(new Date())}</p>

        {todo === null ? (
          <p className="map-calm-muted">Bläddrar i blocket...</p>
        ) : (
          <>
            <p className="map-calm-heading">Dina events</p>
            <ul className="map-calm-todo">
              {todo.booked.length > 0 ? (
                <>
                  {todo.booked.slice(0, MAX_LINES).map((event) => (
                    <TodoLine key={event.id} onClick={() => onOpenEvent(event.id)}>
                      <EventLabel event={event} bold />
                    </TodoLine>
                  ))}
                  <TipLine onClick={() => onOpen('events', '/events?flik=mina-events')} plain>
                    Alla mina events →
                  </TipLine>
                </>
              ) : todo.hasBookedLater ? (
                <TipLine onClick={() => onOpen('events', '/events?flik=mina-events')} flush>
                  Inga bokade events den här veckan. Alla mina events →
                </TipLine>
              ) : (
                <TipLine onClick={() => onOpen('events')} flush>
                  Inga bokade events. Kika på Events?
                </TipLine>
              )}
            </ul>
            <p className="map-calm-heading map-calm-heading-next">Väntar på dig</p>
            <ul className={`map-calm-todo${opening ? ' is-opening' : ''}`} aria-busy={opening}>
              {!countsReady ? null : waiting === 0 ? (
                <TipLine onClick={() => onOpen('brev')} flush>
                  {/* Kortare på mobil, så att den får plats på en rad. */}
                  {mobile ? 'Inget som väntar. Skriv ett brev?' : 'Inget som väntar. Skriv ett brev till en kompis?'}
                </TipLine>
              ) : (
                <>
                  {eventInvitations > 0 && (
                    <TodoLine
                      onClick={() =>
                        eventInvitations === 1
                          ? onOpenEvent(todo.eventInvitations[0].id)
                          : onOpen('events', '/events?flik=inbjudningar')
                      }
                    >
                      Svara på {plural(eventInvitations, 'eventinbjudan', 'eventinbjudningar')}
                    </TodoLine>
                  )}
                  {invitations > 0 && (
                    <TodoLine
                      onClick={() =>
                        openWaiting('klubbar', invitations, '/klubbar?flik=inbjudningar', async () => {
                          const club = (await fresh(groupsOverviewQuery)).invitations?.[0]
                          return club ? `/klubbar?klubb=${club.id}` : null
                        })
                      }
                    >
                      Svara på {plural(invitations, 'klubbinbjudan', 'klubbinbjudningar')}
                    </TodoLine>
                  )}
                  {requests > 0 && (
                    <TodoLine
                      onClick={() =>
                        openWaiting('personer', requests, '/personer?flik=kompisforfragningar', async () => {
                          const request = (await fresh(contactsQuery)).incoming_requests?.[0]
                          return request ? `/anvandare/${request.user.id}` : null
                        })
                      }
                    >
                      {plural(requests, 'medlem vill', 'medlemmar vill')} bli din kompis
                    </TodoLine>
                  )}
                  {letters > 0 && (
                    <TodoLine
                      onClick={() =>
                        openWaiting('brev', letters, '/meddelanden', async () => {
                          const conversation = (await fresh(conversationsQuery)).find((c) => c.unread)
                          return conversation ? `/meddelanden/${conversation.id}` : null
                        })
                      }
                    >
                      Läs {plural(letters, 'nytt brev', 'nya brev')}
                    </TodoLine>
                  )}
                  {notifications > 0 && (
                    <TodoLine
                      onClick={() =>
                        openWaiting('notiser', notifications, '/notiser', async () => {
                          const notification = (await fresh(notificationsQuery)).find((n) => !n.read)
                          return notification ? `/notiser?notis=${notification.id}` : null
                        })
                      }
                    >
                      Läs {plural(notifications, 'ny notis', 'nya notiser')}
                    </TodoLine>
                  )}
                </>
              )}
            </ul>
            <p className="map-calm-heading map-calm-heading-next">{nearbyHeading}</p>
            <ul className="map-calm-todo">
              {!todo.hasKommun ? (
                <TipLine onClick={() => onOpen('profil')} flush>
                  Lägg till din kommun i profilen, så visas events i närheten.
                </TipLine>
              ) : nearbyLines.length > 0 ? (
                nearbyLines.slice(0, MAX_LINES).map((event) => (
                  <TipLine key={event.id} onClick={() => onOpenEvent(event.id)}>
                    <EventLabel event={event} />
                  </TipLine>
                ))
              ) : (
                <TipLine onClick={() => onOpen('events', '/events?skapa=1')} flush>
                  Inget i närheten just nu. Skapa ett event?
                </TipLine>
              )}
            </ul>
            {nothingAtAll && todo.suggestions.length > 0 && (
              <>
                <p className="map-calm-heading map-calm-heading-next">Förslag för dig</p>
                <ul className="map-calm-todo">
                  {todo.suggestions.map(({ key, club, event, why }) =>
                    club ? (
                      <TipLine key={key} onClick={() => onOpen('klubbar', `/klubbar?klubb=${club.id}`)}>
                        {club.name}, {why}
                      </TipLine>
                    ) : (
                      <TipLine key={key} onClick={() => onOpenEvent(event.id)}>
                        {event.title}, {why}
                      </TipLine>
                    ),
                  )}
                </ul>
              </>
            )}
          </>
        )}
        {/* Integritetsinformationen (PrivacyPage) längst ner, vid marginalen som texten ovanför, där
            Intressekompisen inte syns. Annars står den under kompisen (se MapPage). */}
        <p className="map-calm-privacy">
          <Link to="/integritet" className="quiet-link">
            Integritetsinformation
          </Link>
        </p>
      </div>
    </div>
  )
}

// Ett events namn och när det börjar, i rödbrunt efter namnet (som datumet överst). Får raden inte plats kortas namnet
// med "…", men tiden syns alltid. `bold`: namnet i fetstil (ens egna events).
function EventLabel({ event, bold = false }) {
  const Title = bold ? 'strong' : 'span'
  return (
    <span className="map-calm-event">
      <Title className="map-calm-title">{event.title}</Title>
      <span className="map-calm-when">{eventTime.format(new Date(event.starts_at))}</span>
    </span>
  )
}

// En rad som väntar på en: en ritad ruta och texten, som öppnar rätt block.
function TodoLine({ onClick, children }) {
  return (
    <li>
      <button type="button" className="map-calm-line" onClick={onClick}>
        <svg className="map-calm-box" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 4 L17 3 L16.5 17 L3.5 16.5 Z" />
        </svg>
        <span>{children}</span>
      </button>
    </li>
  )
}

// Ett tips (I närheten, Förslag för dig), inte något man måste göra, så en ritad punkt i stället för en ruta. Med
// `plain` utan punkt, för en länk vidare under rader med rutor (t.ex. "Alla mina events →"), indragen som de. Med
// `flush` utan punkt och utan indrag, för en rad som står ensam (t.ex. "Inga bokade events").
function TipLine({ onClick, plain = false, flush = false, children }) {
  return (
    <li>
      <button type="button" className="map-calm-line" onClick={onClick}>
        {!flush && (
          <svg className="map-calm-box" viewBox="0 0 20 20" aria-hidden="true">
            {!plain && (
              <path className="map-calm-dot" d="M10 7.5 C12 7, 13 9, 12.5 10.5 C12 12.5, 9 13, 8 11.5 C7 10, 8 7.8, 10 7.5 Z" />
            )}
          </svg>
        )}
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
