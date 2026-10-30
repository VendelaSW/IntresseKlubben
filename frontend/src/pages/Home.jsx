import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import kompisHaDet from '../assets/kompis-ha-det.webp'
import EmptyState from '../components/EmptyState'
import ForgotPasswordFields from '../components/ForgotPasswordFields'
import LoginFields from '../components/LoginFields'
import Modal from '../components/Modal'
import ProblemStatement from '../components/ProblemStatement'
import RegisterFields from '../components/RegisterFields'
import ServiceDetails from '../components/ServiceDetails'
import { DEV_MODE } from '../devtools/devMode'
import { useAuth } from '../hooks/useAuth'
import { useDesignChoice } from '../hooks/useDesignChoice'

// "Logga in som ..." finns bara i testläget (npm run dev:test), och kommer inte ens med i en vanlig build.
const DevLogin = DEV_MODE ? lazy(() => import('../devtools/DevLogin')) : null
// TILLFÄLLIGT (testläget): startsidan med polaroider (väljaren "Förstasidan").
const HomePolaroids = DEV_MODE ? lazy(() => import('../devtools/HomePolaroids')) : null

function Home() {
  const { user, loading } = useAuth()
  const homeChoice = useDesignChoice('homePage')
  const polaroids = (homeChoice === 'polaroider' || homeChoice === 'utspridda' || homeChoice === 'kollage') && HomePolaroids !== null
  const collage = polaroids && homeChoice === 'kollage'
  const scattered = polaroids && (homeChoice === 'utspridda' || collage)
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
    <div
      className={`page home-page${polaroids && view === null ? ' home-page-polaroids' : ''}${scattered && view === null ? ' home-page-scattered' : ''}`}
      style={view === null ? undefined : { gap: '1.25rem' }}
    >
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
      {polaroids && view === null && (
        <Suspense fallback={null}>
          <HomePolaroids scattered={scattered} collage={collage} />
        </Suspense>
      )}
      {view === null &&
        (polaroids ? (
          <p className="home-pitch">Vi är ingen dejtingapp. Vi vill bara hjälpa människor att hitta på saker tillsammans!</p>
        ) : (
          <ProblemStatement centered />
        ))}

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
          <button type="button" className="text-button" onClick={() => show(null)}>
            ← Tillbaka
          </button>
        </>
      )}

      {view === 'forgot' && (
        <>
          <ForgotPasswordFields onSwitchToLogin={() => show('login')} />
          <button type="button" className="text-button" onClick={() => show(null)}>
            ← Tillbaka
          </button>
        </>
      )}

      {view === 'register' && (
        <>
          <RegisterFields
            onSwitchToLogin={() => show('login')}
            onRegistered={() => {
              setView('login')
              setJustRegistered(true)
            }}
          />
          <button type="button" className="text-button" onClick={() => show(null)}>
            ← Tillbaka
          </button>
        </>
      )}

      {/* TILLFÄLLIGT (testläget, förstasidan med polaroider): "Läs mer" öppnas i en ruta ovanpå sidan i stället för att fällas
          ut nedåt, eftersom sidan fyller hela skärmen. */}
      <button
        type="button"
        className="info-link"
        {...(polaroids
          ? { 'aria-haspopup': 'dialog' }
          : { 'aria-expanded': aboutOpen, 'aria-controls': 'service-details' })}
        onClick={() => setAboutOpen((open) => !open)}
      >
        {aboutOpen && !polaroids ? 'Visa mindre' : 'Läs mer om tjänsten'}
      </button>
      {aboutOpen && !polaroids && <ServiceDetails id="service-details" />}
      {aboutOpen && polaroids && (
        <Modal title="Läs mer om tjänsten" onClose={() => setAboutOpen(false)}>
          <div className="modal-scroll">
            <ServiceDetails id="service-details" />
          </div>
        </Modal>
      )}
    </div>
  )
}

export default Home
