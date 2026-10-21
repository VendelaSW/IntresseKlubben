import { Link, Outlet, useNavigate } from 'react-router-dom'
import eventIcon from '../assets/event.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import brevIcon from '../assets/brev.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import { useAuth } from '../hooks/useAuth'

const NAV_ITEMS = [
  { label: 'Hem', icon: hemIcon },
  { label: 'Brev', icon: brevIcon },
  { label: 'Personer', icon: personerIcon },
  { label: 'Klubbar', icon: klubbarIcon },
  { label: 'Events', icon: eventIcon },
]

// Ramen runt "Skapa din profil" (/profil?lista=1) för den som inte har gjort
// klart sin profil än: header (logga, meny, användare) + formuläret. Appens
// sidor finns annars bara som block på kartan (se App.jsx). Menyn visar vad som
// väntar, men är inte länkar, så att man inte lämnar formuläret av misstag
// (allt annat är ändå låst tills profilen är klar).
function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

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
          {NAV_ITEMS.map(({ label, icon }) => (
            <span
              key={label}
              className="app-nav-link app-nav-link-locked"
              title="Skapa din profil först"
              aria-disabled="true"
            >
              <img src={icon} alt="" className="nav-icon" />
              <span className="app-nav-label">{label}</span>
            </span>
          ))}
        </nav>
        <div className="app-user">
          <span className="highlight">{user?.username}</span>
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
