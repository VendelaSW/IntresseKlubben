import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import eventIcon from '../assets/event.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import brevIcon from '../assets/brev.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import { useAuth } from '../hooks/useAuth'
import { setStartView } from '../hooks/useStartView'
import { getContacts } from '../services/contacts'
import { INVITATIONS_CHANGED, getGroupInvitationCount } from '../services/groups'
import { countUnseenConversations, getConversations } from '../services/messages'

// Hur ofta siffran på brev-loggan räknas om medan man står kvar på en sida.
const MESSAGES_POLL_MS = 30000

// Menyord utan egen sida än blir bara text tills vidare; de med `to` länkar dit.
const NAV_ITEMS = [
  { label: 'Hem', to: '/hem', icon: hemIcon },
  { label: 'Brev', to: '/meddelanden', icon: brevIcon },
  { label: 'Personer', to: '/personer', icon: personerIcon },
  { label: 'Klubbar', to: '/klubbar', icon: klubbarIcon },
  { label: 'Events', to: '/events', icon: eventIcon },
]

// Ram runt alla inloggade sidor: header (logga, meny, användare) + sidans
// eget innehåll. Byggd efter samma mönster som demots DemoApp.jsx, men
// kopplad till riktig inloggning via useAuth() istället för påhittad data.
function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [incomingCount, setIncomingCount] = useState(0)
  const [unseenMessages, setUnseenMessages] = useState(0)
  const [clubInvitations, setClubInvitations] = useState(0)
  // Siffrorna i menyn bygger på anrop som är låsta tills profilen är klar
  // (require_profile i backend), så de hämtas inte innan dess.
  const profileDone = Boolean(user?.profile_completed)

  // Antal obesvarade kontaktförfrågningar, för badgen vid Personer. Hämtas
  // om vid varje sidbyte - enkel och "nog bra" uppdatering utan att bygga
  // en delad kontakter-context bara för en badge.
  useEffect(() => {
    if (!profileDone) return undefined
    getContacts()
      .then((data) => setIncomingCount(data.incoming_requests.length))
      .catch(() => {})
  }, [location.pathname, profileDone])

  // Antal klubbar man är inbjuden till, för märket vid Klubbar. Räknas om vid
  // sidbyte och när man har gått med i eller avböjt en klubb.
  useEffect(() => {
    if (!profileDone) return undefined
    let cancelled = false
    function refresh() {
      getGroupInvitationCount()
        .then((count) => !cancelled && setClubInvitations(count))
        .catch(() => {})
    }
    refresh()
    window.addEventListener(INVITATIONS_CHANGED, refresh)
    return () => {
      cancelled = true
      window.removeEventListener(INVITATIONS_CHANGED, refresh)
    }
  }, [location.pathname, profileDone])

  // Konversationer med nya brev, för siffran på brev-loggan: samma antal som
  // fliken Nya på Brev. En konversation räknas som sedd först när man öppnar
  // den, och den man har öppen (/meddelanden/:id) räknas inte, eftersom chatten
  // själv markerar den som sedd. Brev från någon annan medan man chattar räknas
  // som vanligt. Räknas om vid sidbyte och var MESSAGES_POLL_MS, så att nya brev
  // syns utan att man byter sida. Pausar när fliken inte syns och räknar om
  // direkt när man kommer tillbaka.
  useEffect(() => {
    if (!profileDone) return undefined
    const openMatch = location.pathname.match(/^\/meddelanden\/(\d+)/)
    const openConversationId = openMatch ? Number(openMatch[1]) : null
    let cancelled = false
    let fetching = false

    async function refresh() {
      if (fetching || document.hidden) return
      fetching = true
      try {
        const conversations = await getConversations()
        if (cancelled) return
        setUnseenMessages(countUnseenConversations(conversations.filter((c) => c.id !== openConversationId)))
      } catch {
        // Siffran är inte viktig nog för ett felmeddelande; nästa försök kommer snart.
      } finally {
        fetching = false
      }
    }

    function onVisibilityChange() {
      if (!document.hidden) refresh()
    }

    refresh()
    const timer = setInterval(refresh, MESSAGES_POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [location.pathname, profileDone])

  function handleLogout() {
    logout()
    navigate('/')
  }

  // Tillbaka till kartan som startsida (se useStartView och HomeSwitch).
  function showMap() {
    setStartView('karta')
    navigate('/hem')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/hem" className="app-brand">
          <img src={logo} alt="Intresseklubben" className="app-brand-logo" />
        </Link>
        <nav className="app-nav" aria-label="Huvudmeny">
          {/* Innan profilen är klar är ikonerna inte länkar, så att man inte
              lämnar "Skapa din profil" av misstag (allt annat är ändå låst). */}
          {NAV_ITEMS.map(({ label, to, icon }) =>
            to && profileDone ? (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
              >
                {/* Badgarna går på adressen, inte texten, så att ett nytt
                    menynamn inte tar bort dem. */}
                {to === '/personer' && incomingCount > 0 && (
                  <span className="nav-badge" aria-label={`${incomingCount} nya förfrågningar`}>
                    {incomingCount}
                  </span>
                )}
                {to === '/klubbar' && clubInvitations > 0 && (
                  <span className="nav-badge" aria-label={`${clubInvitations} klubbinbjudningar`}>
                    {clubInvitations}
                  </span>
                )}
                {to === '/meddelanden' && unseenMessages > 0 && (
                  <span className="nav-badge" aria-label={`${unseenMessages} konversationer med nya brev`}>
                    {unseenMessages}
                  </span>
                )}
                <img src={icon} alt="" className="nav-icon" />
                <span className="app-nav-label">{label}</span>
              </NavLink>
            ) : (
              <span
                key={label}
                className={`app-nav-link${to ? ' app-nav-link-locked' : ''}`}
                title={to ? 'Skapa din profil först' : undefined}
                aria-disabled={to ? true : undefined}
              >
                <img src={icon} alt="" className="nav-icon" />
                <span className="app-nav-label">{label}</span>
              </span>
            ),
          )}
        </nav>
        <div className="app-user">
          {profileDone && (
            <button type="button" className="secondary-button button-small" onClick={showMap}>
              Visa kartan
            </button>
          )}
          <Link to="/profil" className="info-link highlight" style={{ borderBottom: 'none' }}>
            {user?.username}
          </Link>
          <button type="button" className="primary-button button-small" onClick={handleLogout}>
            Logga ut
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
