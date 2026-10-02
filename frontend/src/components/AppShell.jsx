import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import brevIcon from '../assets/brev.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import { useAuth } from '../hooks/useAuth'
import { getContacts } from '../services/contacts'

// Menyord utan egen sida än blir bara text tills vidare; de med `to` länkar dit.
const NAV_ITEMS = [
  { label: 'Hem', to: '/hem', icon: hemIcon },
  { label: 'Brev', to: '/meddelanden', icon: brevIcon },
  { label: 'Personer', to: '/personer', icon: personerIcon },
  { label: 'Klubbar', to: '/klubbar', icon: klubbarIcon },
]

// Ram runt alla inloggade sidor: header (logga, meny, användare) + sidans
// eget innehåll. Byggd efter samma mönster som demots DemoApp.jsx, men
// kopplad till riktig inloggning via useAuth() istället för påhittad data.
function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [incomingCount, setIncomingCount] = useState(0)

  // Antal obesvarade kontaktförfrågningar, för badgen vid Personer. Hämtas
  // om vid varje sidbyte - enkel och "nog bra" uppdatering utan att bygga
  // en delad kontakter-context bara för en badge.
  useEffect(() => {
    getContacts()
      .then((data) => setIncomingCount(data.incoming_requests.length))
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
          {NAV_ITEMS.map(({ label, to, icon }) =>
            to ? (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
              >
                {label === 'Personer' && incomingCount > 0 && (
                  <span className="nav-badge" aria-label={`${incomingCount} nya förfrågningar`}>
                    {incomingCount}
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
