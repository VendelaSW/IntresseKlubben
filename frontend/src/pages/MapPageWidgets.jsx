import { useEffect, useRef, useState } from 'react'
import brevIcon from '../assets/brev.png'
import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import hemIcon from '../assets/hem.png'
import personerIcon from '../assets/personer.png'

// Appens sidor som små lappar bredvid profillappen (på mobil som en rad
// längst ned), med samma ikoner som appens meny. Ett klick lägger sidan som
// ett block på kartan (se MapPagePad); klickar man på den öppna sidans lapp
// igen stängs blocket. Notiserna ligger i profillappens meny (se MapProfileWidget).
//
// Lapparna har samma märken som appens meny (se useBadgeCounts), och när en
// siffra går upp medan man är på kartan studsar lappen till, så att man ser
// att något har hänt. `badge` säger vilken siffra lappen visar och hur den
// läses upp.
//
// På mobil är lapparna en flytande meny längst ned (se map.css), med Hem (kartan, inget block öppet) som en större
// knapp i mitten. En gul bubbla glider till den öppna sidan och töjs ut på vägen.
const WIDGETS = [
  { id: 'brev', label: 'Brev', icon: brevIcon, badge: ['unseenMessages', 'konversationer med nya brev'] },
  { id: 'personer', label: 'Medlemmar', icon: personerIcon, badge: ['contactRequests', 'nya kompisförfrågningar'] },
  { id: null, label: 'Kartan', icon: hemIcon, badge: [] },
  { id: 'klubbar', label: 'Klubbar', icon: klubbarIcon, badge: ['clubInvitations', 'klubbinbjudningar'] },
  { id: 'events', label: 'Events', icon: eventIcon, badge: ['eventNews', 'nya events och inbjudningar'] },
]

// Hur länge en lapp studsar (samma som animationen map-widget-ping).
const PING_MS = 1200

// `counts` är siffrorna från useBadgeCounts (i MapPrototype, som delar dem med profillappen), null tills första
// hämtningen är klar.
function MapPageWidgets({ openPage, onOpen, counts }) {
  const [pinged, setPinged] = useState(() => new Set())
  const previous = useRef(null)
  const pingTimer = useRef(null)
  // Hur många gånger bubblan har flyttat: två likadana animationer byts av, så att den spelas om vid varje byte.
  const [moves, setMoves] = useState(0)
  const shownPage = useRef(openPage)

  useEffect(() => {
    if (shownPage.current === openPage) return
    shownPage.current = openPage
    setMoves((n) => n + 1)
  }, [openPage])

  useEffect(() => {
    if (!counts) return
    const before = previous.current
    previous.current = counts
    // Första hämtningen är inget nytt, bara läget när kartan öppnades.
    if (!before) return
    const up = WIDGETS.filter(({ badge: [key] }) => key && counts[key] > before[key]).map(({ id }) => id)
    if (up.length === 0) return
    setPinged(new Set(up))
    clearTimeout(pingTimer.current)
    pingTimer.current = setTimeout(() => setPinged(new Set()), PING_MS)
  }, [counts])

  useEffect(() => () => clearTimeout(pingTimer.current), [])

  const openIndex = WIDGETS.findIndex(({ id }) => id === (openPage ?? null))
  const goo = moves === 0 ? '' : moves % 2 ? ' is-goo-a' : ' is-goo-b'

  return (
    <nav className="map-page-widgets" aria-label="Sidor">
      {/* Bubblan på mobil. Ett block som inte har någon lapp (t.ex. Notiser från profillappen) får ingen bubbla. */}
      <span
        className={`map-nav-blob${openPage ? '' : ' is-home'}${openIndex < 0 ? ' is-hidden' : ''}${goo}`}
        style={{ '--nav-index': openIndex }}
        aria-hidden="true"
      />
      {WIDGETS.map(({ id, label, icon, badge: [key, badgeLabel] }) => (
        <button
          key={id ?? 'karta'}
          type="button"
          className={`map-page-widget${id ? '' : ' map-page-widget-home'}${openPage === id ? ' is-open' : ''}${pinged.has(id) ? ' is-pinged' : ''}`}
          aria-pressed={(openPage ?? null) === id}
          title={label}
          onClick={() => onOpen(id && openPage === id ? null : id)}
        >
          {key && counts?.[key] > 0 && (
            <span className="map-widget-badge" aria-label={`${counts[key]} ${badgeLabel}`}>
              {counts[key]}
            </span>
          )}
          <img src={icon} alt="" className="map-page-widget-icon" />
          <span className="map-page-widget-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default MapPageWidgets
