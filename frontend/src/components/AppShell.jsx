import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import eventIcon from '../assets/event.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import brevIcon from '../assets/brev.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import { useAuth } from '../hooks/useAuth'
import { getContacts } from '../services/contacts'
import {
  countUnseenConversations,
  getConversations,
  markConversationsSeen,
} from '../services/messages'

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

  // Antal obesvarade kontaktförfrågningar, för badgen vid Personer. Hämtas
  // om vid varje sidbyte - enkel och "nog bra" uppdatering utan att bygga
  // en delad kontakter-context bara för en badge.
  useEffect(() => {
    getContacts()
      .then((data) => setIncomingCount(data.incoming_requests.length))
      .catch(() => {})
  }, [location.pathname])

  // Konversationer med nya brev, för siffran på brev-loggan. När man kommer
  // till Brev (/meddelanden) räknas allt som sett och siffran försvinner.
  // Räknas om vid sidbyte och var MESSAGES_POLL_MS, så att nya brev syns utan
  // att man byter sida. Pausar när fliken inte syns och räknar om direkt när
  // man kommer tillbaka.
  useEffect(() => {
    const onMessages = location.pathname.startsWith('/meddelanden')
    let cancelled = false
    let fetching = false
    // Allt markeras som sett bara vid första hämtningen efter sidbytet. Brev
    // som kommer medan man står kvar (t.ex. från B medan man chattar med A)
    // har man inte sett, och ska räknas som nya när man går därifrån.
    let firstFetch = true

    async function refresh() {
      if (fetching || document.hidden) return
      fetching = true
      try {
        const conversations = await getConversations()
        if (cancelled) return
        if (onMessages && firstFetch) markConversationsSeen(conversations)
        firstFetch = false
        setUnseenMessages(onMessages ? 0 : countUnseenConversations(conversations))
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
  }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/hem" className="app-brand">
          <img src={logo} alt="Intresseklubben" className="app-brand-logo" />
        </Link>
        <nav className="app-nav" aria-label="Huvudmeny">
          {NAV_ITEMS.map(({ label, to, icon }) =>
            to ? (
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
                {to === '/meddelanden' && unseenMessages > 0 && (
                  <span className="nav-badge" aria-label={`${unseenMessages} konversationer med nya brev`}>
                    {unseenMessages}
                  </span>
                )}
                <img src={icon} alt="" className="nav-icon" />
                <span className="app-nav-label">{label}</span>
              </NavLink>
            ) : (
              <span key={label} className="app-nav-link">
                <img src={icon} alt="" className="nav-icon" />
                <span className="app-nav-label">{label}</span>
              </span>
            ),
          )}
        </nav>
        <div className="app-user">
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
