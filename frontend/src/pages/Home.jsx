import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import kompisHaDet from '../assets/kompis-ha-det.webp'
import DrawnArrow from '../components/DrawnArrow'
import EmptyState from '../components/EmptyState'
import ForgotPasswordFields from '../components/ForgotPasswordFields'
import LoginFields from '../components/LoginFields'
import ProblemStatement from '../components/ProblemStatement'
import RegisterFields from '../components/RegisterFields'
import ServiceDetails from '../components/ServiceDetails'
import { DEV_MODE } from '../devtools/devMode'
import { useAuth } from '../hooks/useAuth'

// "Logga in som ..." finns bara i testläget (npm run dev:test), och kommer inte ens med i en vanlig build.
const DevLogin = DEV_MODE ? lazy(() => import('../devtools/DevLogin')) : null

function Home() {
  const { user, loading } = useAuth()
  // Precis utloggad (Logga ut i menyn skickar med det): kompisen säger "Ha det!" överst på startsidan.
  const loggedOut = Boolean(useLocation().state?.loggedOut)
  const [view, setView] = useState(null) // null | 'login' | 'register' | 'forgot'
  // Har man precis skapat ett konto hamnar man direkt på inloggningen, med ett
  // meddelande om det. Byter man vy själv försvinner meddelandet.
  const [justRegistered, setJustRegistered] = useState(false)
  // "Läs mer om tjänsten" fälls ut här på sidan, så att man inte lämnar den.
  const [aboutOpen, setAboutOpen] = useState(false)

  function show(next) {
    setJustRegistered(false)
    setView(next)
  }

  // Redan inloggad: inget att göra här, skicka vidare till kartan.
  if (loading) return null
  if (user) return <Navigate to="/hem" replace />

  return (
    <div className={`page home-page${view === null ? '' : ' home-page-form'}`}>
      {/* Tillbaka till startsidan: en pil uppe i vänstra hörnet i inloggnings-, registrerings- och glömt-lösenord-vyerna. */}
      {view !== null && (
        <button type="button" className="back-arrow" aria-label="Tillbaka" onClick={() => show(null)}>
          <DrawnArrow className="back-arrow-icon" />
        </button>
      )}
      <section className="hero">
        {/* Mindre logga i inloggnings-/registreringsvyerna så att hela formuläret
            syns utan att man behöver scrolla. */}
        <img
          src={logo}
          alt="Intresseklubben"
          className={view === null ? 'logo' : 'logo-small'}
        />
        {view === null && <p className="tagline">Vi antecknar, ni träffas.</p>}
      </section>
      {loggedOut && view === null && (
        <EmptyState
          className="home-farewell"
          image={kompisHaDet}
          title="Du är utloggad"
          text="Välkommen tillbaka när du vill!"
        />
      )}
      {view === null && <ProblemStatement centered />}

      {view === null && (
        <div className="account-choice-links">
          <button type="button" className="primary-button" onClick={() => show('login')}>
            Logga in
          </button>
          <button type="button" className="primary-button" onClick={() => show('register')}>
            Registrera dig
          </button>
        </div>
      )}

      {DevLogin && view === null && (
        <Suspense fallback={null}>
          <DevLogin />
        </Suspense>
      )}

      {view === 'login' && (
        <>
          <LoginFields
            onSwitchToRegister={() => show('register')}
            onForgotPassword={() => show('forgot')}
            notice={
              justRegistered
                ? 'Kontot är skapat! Vi har skickat ett mejl för att bekräfta din e-post. Logga in med ditt användarnamn eller din e-post.'
                : null
            }
          />
        </>
      )}

      {view === 'forgot' && <ForgotPasswordFields onSwitchToLogin={() => show('login')} />}

      {view === 'register' && (
        <RegisterFields
          onSwitchToLogin={() => show('login')}
          onRegistered={() => {
            setView('login')
            setJustRegistered(true)
          }}
        />
      )}

      {/* "Läs mer om tjänsten" finns bara på startsidan, inte i inloggnings-/registreringsvyerna. */}
      {view === null && (
        <>
          <button
            type="button"
            className="info-link"
            aria-expanded={aboutOpen}
            aria-controls="service-details"
            onClick={() => setAboutOpen((open) => !open)}
          >
            {aboutOpen ? 'Visa mindre' : 'Läs mer om tjänsten'}
          </button>
          {aboutOpen && <ServiceDetails id="service-details" />}
        </>
      )}
    </div>
  )
}

export default Home
