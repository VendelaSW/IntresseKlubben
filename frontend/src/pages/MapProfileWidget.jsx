import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { moderationReportsQuery } from '../services/moderation'
import { profileQuery } from '../services/profile'

// Menyn: profilsidan och notiserna, som läggs på kartan som block (via `onOpen`), för
// moderatorer också Moderering (med antalet nya anmälningar), och sist Logga ut. Appens övriga sidor har egna lappar (se MapPageWidgets), och
// växeln Karta | Att göra sitter på kartan (se MapPrototype).
const MENU = [{ id: 'profil', label: 'Profilsida' }]

// Profillappen uppe till höger på kartan, bredvid zoomknapparna: namnet till
// vänster och profilbilden till höger. Ett klick fäller ut menyn (MENU).
// Kartan ligger bakom inloggningen, så användaren finns alltid här.
// `notifications` är antalet olästa notiser (från useBadgeCounts i MapPrototype, samma som lapparna): på namnet när
// menyn är stängd, så att man ser att det finns något, och vid Notiser när den är öppen.
function MapProfileWidget({ onOpen, notifications = 0 }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  // Profilen ur det delade minnet (se services/queryClient.js), så att namnet
  // och bilden här ändras direkt när man sparar profilen. Utan profil (eller om
  // den inte gick att hämta) visas användarnamnet och initialen.
  const { data: profile = null } = useQuery(profileQuery)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  // Nya anmälningar, hämtas först när en moderator öppnar menyn (samma lista som på Moderering).
  const { data: newReports } = useQuery({ ...moderationReportsQuery(false), enabled: open && Boolean(user.is_moderator) })
  const menu = [
    ...MENU,
    { id: 'notiser', label: 'Notiser', count: notifications, countLabel: 'olästa notiser' },
    ...(user.is_moderator ? [{ id: 'moderering', label: 'Moderering', count: newReports?.length }] : []),
  ]

  // Menyn stängs med Escape eller ett klick någon annanstans (t.ex. på kartan).
  useEffect(() => {
    if (!open) return
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleLogout() {
    logout()
    navigate('/')
  }

  const name = profile?.name ?? user.username
  // Bara förnamnet på lappen ("Roberto Carlos" blir "Roberto"), så att långa namn inte gör lappen bred.
  // Hela namnet syns när man håller över, och skärmläsare läser det.
  const firstName = name.trim().split(/\s+/)[0]
  const unread = notifications > 0 ? `, ${notifications} olästa notiser` : ''
  return (
    <div ref={rootRef} className="map-profile-wrap">
      <button
        type="button"
        className={`map-profile${open ? ' is-open' : ''}`}
        aria-label={`Din profil: ${name}${unread}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Olästa notiser på namnet tills menyn öppnas; då står siffran vid Notiser i stället. */}
        {!open && notifications > 0 && (
          <span className="map-widget-badge" aria-hidden="true">
            {notifications}
          </span>
        )}
        {/* Ett långt förnamn kortas med "…". */}
        <span className="map-profile-name" title={name}>
          {firstName}
        </span>
        {profile?.image_url ? (
          <img src={profile.image_url} alt="" className="map-profile-avatar" />
        ) : (
          <span className="map-profile-avatar map-profile-initial" aria-hidden="true">
            {name.trim()[0]?.toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <ul className="map-profile-menu">
          {menu.map(({ id, label, count, countLabel = 'nya' }) => (
            <li key={id}>
              <button
                type="button"
                className="map-profile-menu-item"
                onClick={() => {
                  setOpen(false)
                  onOpen(id)
                }}
              >
                {label}
                {count > 0 && (
                  <span className="nav-badge map-profile-menu-count" aria-label={`${count} ${countLabel}`}>
                    {count}
                  </span>
                )}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="map-profile-menu-item" onClick={handleLogout}>
              Logga ut
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export default MapProfileWidget
