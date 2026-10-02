import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import { useAuth } from '../hooks/useAuth'
import { getContacts } from '../services/contacts'
import {
  countUnseenConversations,
  getConversations,
  markConversationsSeen,
} from '../services/messages'

// Menyord utan egen sida än blir bara text tills vidare; de med `to` länkar dit.
const NAV_ITEMS = [
  { label: 'Hem', to: '/hem' },
  { label: 'Meddelanden', to: '/meddelanden' },
  { label: 'Personer', to: '/personer' },
  { label: 'Klubbar', to: '/klubbar' },
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

  // Konversationer med nya meddelanden, för badgen vid Meddelanden. När man
  // är på Meddelanden räknas allt som sett och badgen försvinner.
  useEffect(() => {
    const onMessages = location.pathname.startsWith('/meddelanden')
    getConversations()
      .then((conversations) => {
        if (onMessages) markConversationsSeen(conversations)
        setUnseenMessages(onMessages ? 0 : countUnseenConversations(conversations))
      })
      .catch(() => {})
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
          {NAV_ITEMS.map(({ label, to }) =>
            to ? (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
              >
                {label}
                {label === 'Personer' && incomingCount > 0 && (
                  <span className="nav-badge" aria-label={`${incomingCount} nya förfrågningar`}>
                    {incomingCount}
                  </span>
                )}
                {label === 'Meddelanden' && unseenMessages > 0 && (
                  <span className="nav-badge" aria-label={`${unseenMessages} konversationer med nya meddelanden`}>
                    {unseenMessages}
                  </span>
                )}
              </NavLink>
            ) : (
              <span key={label} className="app-nav-link">
                {label}
              </span>
            ),
          )}
        </nav>
        <div className="app-user">
          <Link to="/profil" className="info-link">
            {user?.username}
          </Link>
          <button type="button" className="text-button" onClick={handleLogout}>
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
