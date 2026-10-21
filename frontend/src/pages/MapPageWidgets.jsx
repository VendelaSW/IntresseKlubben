import { useEffect, useRef, useState } from 'react'
import brevIcon from '../assets/brev.png'
import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import personerIcon from '../assets/personer.png'
import { useBadgeCounts } from '../hooks/useBadgeCounts'

// Appens sidor som små lappar bredvid profillappen (på mobil som en rad
// längst ned), med samma ikoner som appens meny. Ett klick lägger sidan som
// ett block på kartan (se MapPagePad); klickar man på den öppna sidans lapp
// igen stängs blocket.
//
// Lapparna har samma märken som appens meny (se useBadgeCounts), och när en
// siffra går upp medan man är på kartan studsar lappen till, så att man ser
// att något har hänt. `badge` säger vilken siffra lappen visar och hur den
// läses upp.
const WIDGETS = [
  { id: 'brev', label: 'Brev', icon: brevIcon, badge: ['unseenMessages', 'konversationer med nya brev'] },
  { id: 'personer', label: 'Personer', icon: personerIcon, badge: ['contactRequests', 'nya kompisförfrågningar'] },
  { id: 'klubbar', label: 'Klubbar', icon: klubbarIcon, badge: ['clubInvitations', 'klubbinbjudningar'] },
  { id: 'events', label: 'Events', icon: eventIcon, badge: ['eventNews', 'nya events och inbjudningar'] },
]

// Hur länge en lapp studsar (samma som animationen map-widget-ping).
const PING_MS = 1200

function MapPageWidgets({ openPage, onOpen }) {
  // Räknas om när ett block öppnas eller stängs, eftersom man kan ha läst brev
  // eller svarat på en inbjudan i det.
  // null tills första hämtningen är klar (se useBadgeCounts).
  const counts = useBadgeCounts({ refreshKey: openPage })
  const [pinged, setPinged] = useState(() => new Set())
  const previous = useRef(null)
  const pingTimer = useRef(null)

  useEffect(() => {
    if (!counts) return
    const before = previous.current
    previous.current = counts
    // Första hämtningen är inget nytt, bara läget när kartan öppnades.
    if (!before) return
    const up = WIDGETS.filter(({ badge: [key] }) => counts[key] > before[key]).map(({ id }) => id)
    if (up.length === 0) return
    setPinged(new Set(up))
    clearTimeout(pingTimer.current)
    pingTimer.current = setTimeout(() => setPinged(new Set()), PING_MS)
  }, [counts])

  useEffect(() => () => clearTimeout(pingTimer.current), [])

  return (
    <nav className="map-page-widgets" aria-label="Sidor">
      {WIDGETS.map(({ id, label, icon, badge: [key, badgeLabel] }) => (
        <button
          key={id}
          type="button"
          className={`map-page-widget${openPage === id ? ' is-open' : ''}${pinged.has(id) ? ' is-pinged' : ''}`}
          aria-pressed={openPage === id}
          title={label}
          onClick={() => onOpen(openPage === id ? null : id)}
        >
          {counts?.[key] > 0 && (
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
