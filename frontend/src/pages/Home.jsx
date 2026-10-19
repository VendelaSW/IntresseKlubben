import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import LoginFields from '../components/LoginFields'
import ProblemStatement from '../components/ProblemStatement'
import RegisterFields from '../components/RegisterFields'
import ServiceDetails from '../components/ServiceDetails'
import { useAuth } from '../hooks/useAuth'

function Home() {
  const { user, loading } = useAuth()
  const [view, setView] = useState(null) // null | 'login' | 'register'
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
    <div className="page" style={view === null ? undefined : { gap: '1.25rem' }}>
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

      {view === 'login' && (
        <>
          <LoginFields
            onSwitchToRegister={() => show('register')}
            notice={justRegistered ? 'Kontot är skapat! Logga in med ditt användarnamn eller din e-post.' : null}
          />
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
    </div>
  )
}

export default Home
