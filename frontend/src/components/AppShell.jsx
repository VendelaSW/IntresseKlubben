import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import eventIcon from '../assets/event.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import brevIcon from '../assets/brev.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import { useAuth } from '../hooks/useAuth'
import { EMPTY_COUNTS, useBadgeCounts } from '../hooks/useBadgeCounts'
import { setStartView } from '../hooks/useStartView'

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
  // Siffrorna i menyn (se useBadgeCounts). Konversationen man har öppen
  // (/meddelanden/:id) räknas inte som ny.
  const openMatch = location.pathname.match(/^\/meddelanden\/(\d+)/)
  const { contactRequests, clubInvitations, eventInvitations, unseenMessages } =
    useBadgeCounts({
      refreshKey: location.pathname,
      openConversationId: openMatch ? Number(openMatch[1]) : null,
    }) ?? EMPTY_COUNTS
  // Menyn är inte länkar innan profilen är klar (allt annat är ändå låst).
  const profileDone = Boolean(user?.profile_completed)

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
                {to === '/personer' && contactRequests > 0 && (
                  <span className="nav-badge" aria-label={`${contactRequests} nya förfrågningar`}>
                    {contactRequests}
                  </span>
                )}
                {to === '/klubbar' && clubInvitations > 0 && (
                  <span className="nav-badge" aria-label={`${clubInvitations} klubbinbjudningar`}>
                    {clubInvitations}
                  </span>
                )}
                {to === '/events' && eventInvitations > 0 && (
                  <span className="nav-badge" aria-label={`${eventInvitations} eventinbjudningar`}>
                    {eventInvitations}
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
