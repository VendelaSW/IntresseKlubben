import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import { useAuth } from '../hooks/useAuth'

// Menyord utan egen sida än blir bara text tills vidare; de med `to` länkar dit.
const NAV_ITEMS = [
  { label: 'Hem', to: '/hem' },
  { label: 'Personer', to: '/personer' },
  { label: 'Klubbar', to: null },
  { label: 'Karta', to: null },
  { label: 'Evenemang', to: null },
]

// Ram runt alla inloggade sidor: header (logga, meny, användare) + sidans
// eget innehåll. Byggd efter samma mönster som demots DemoApp.jsx, men
// kopplad till riktig inloggning via useAuth() istället för påhittad data.
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
          {NAV_ITEMS.map(({ label, to }) =>
            to ? (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
              >
                {label}
              </NavLink>
            ) : (
              <span key={label} className="app-nav-link">
                {label}
              </span>
            )
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
