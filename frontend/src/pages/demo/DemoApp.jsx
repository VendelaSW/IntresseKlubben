import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { ClubCard, PersonCard } from '../../components/DemoCards'
import { hasProfile, matchPeople, personById, useDemo } from '../../hooks/useDemo'

const NAV = [
  { to: '/demo/app', label: 'Hem', end: true },
  { to: '/demo/app/personer', label: 'Personer' },
  { to: '/demo/app/klubbar', label: 'Klubbar' },
  { to: '/demo/app/karta', label: 'Karta' },
  { to: '/demo/app/evenemang', label: 'Evenemang' },
]

// Huvudsidan efter inloggning: navigation + den valda sektionen.
function DemoApp() {
  const { profile, relations, logout } = useDemo()
  const navigate = useNavigate()

  // Utan ifylld profil finns inget att matcha på, så skicka dit först.
  if (!hasProfile(profile)) return <Navigate to="/demo/profil" replace />

  const incoming = Object.values(relations).filter((r) => r === 'incoming').length

  function handleLogout() {
    logout()
    navigate('/demo')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/demo/app" className="app-brand">
          Intresseklubben
        </Link>
        <nav className="app-nav" aria-label="Huvudmeny">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="app-nav-link">
              {item.label}
              {item.label === 'Personer' && incoming > 0 && (
                <span className="nav-badge" aria-label={`${incoming} nya förfrågningar`}>
                  {incoming}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="app-user">
          <Link to="/demo/profil" className="info-link">
            {profile.name}
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

export function DemoOverview() {
  const { profile, relations, clubs } = useDemo()
  const matches = matchPeople(profile)
    .filter((p) => p.shared.length > 0 && (!relations[p.id] || relations[p.id] === 'sent'))
    .slice(0, 3)
  const incoming = Object.entries(relations)
    .filter(([, r]) => r === 'incoming')
    .map(([id]) => personById(id))
  const myClubs = clubs.filter((c) => c.joined)
  const suggestedClubs = clubs.filter((c) => !c.joined && profile.interests.includes(c.interest)).slice(0, 2)

  return (
    <>
      <section className="app-section">
        <h1 className="app-title">Hej {profile.name}!</h1>
        <p className="hint-text">
          Du bor i {profile.municipality}
          {profile.district && `, ${profile.district}`} och gillar {profile.interests.join(', ').toLowerCase()}.
        </p>
      </section>

      {incoming.length > 0 && (
        <section className="app-section">
          <h2>Nya kontaktförfrågningar</h2>
          <div className="card-grid">
            {incoming.map((person) => (
              <PersonCard key={person.id} person={person} shared={person.interests.filter((i) => profile.interests.includes(i))} />
            ))}
          </div>
        </section>
      )}

      <section className="app-section">
        <div className="section-header">
          <h2>Personer nära dig med samma intressen</h2>
          <Link to="/demo/app/personer" className="info-link">
            Visa alla
          </Link>
        </div>
        {matches.length > 0 ? (
          <div className="card-grid">
            {matches.map((person) => (
              <PersonCard key={person.id} person={person} shared={person.shared} />
            ))}
          </div>
        ) : (
          <p className="hint-text">Inga nya matchningar just nu. Prova att lägga till fler intressen i din profil.</p>
        )}
      </section>

      <section className="app-section">
        <div className="section-header">
          <h2>{myClubs.length > 0 ? 'Dina klubbar' : 'Klubbar för dig'}</h2>
          <Link to="/demo/app/klubbar" className="info-link">
            Alla klubbar
          </Link>
        </div>
        <div className="card-grid">
          {(myClubs.length > 0 ? myClubs : suggestedClubs).map((club) => (
            <ClubCard key={club.id} club={club} highlight={profile.interests} />
          ))}
        </div>
        {myClubs.length === 0 && suggestedClubs.length === 0 && (
          <p className="hint-text">Ingen klubb matchar dina intressen än. Starta en egen under Klubbar!</p>
        )}
      </section>
    </>
  )
}

const COMING_SOON = {
  map: {
    title: 'Karta',
    text: 'Här ska du se personer, klubbar och mötesplatser nära dig på en karta, till exempel caféer och lokaler där klubbarna träffas.',
  },
  events: {
    title: 'Evenemang',
    text: 'Här ska klubbarnas träffar och öppna evenemang listas, så att du kan anmäla dig och se vilka fler som kommer.',
  },
}

export function DemoComingSoon({ kind }) {
  const { title, text } = COMING_SOON[kind]
  return (
    <section className="app-section coming-soon">
      <h1 className="app-title">{title}</h1>
      <span className="status-pill">Kommer snart</span>
      <p className="problem-statement">{text}</p>
    </section>
  )
}

export default DemoApp
