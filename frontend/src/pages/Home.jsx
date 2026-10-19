import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import ForgotPasswordFields from '../components/ForgotPasswordFields'
import LoginFields from '../components/LoginFields'
import ProblemStatement from '../components/ProblemStatement'
import RegisterFields from '../components/RegisterFields'
import { useAuth } from '../hooks/useAuth'

function Home() {
  const { user, loading } = useAuth()
  const [view, setView] = useState(null) // null | 'login' | 'register' | 'forgot'
  // Har man precis skapat ett konto hamnar man direkt på inloggningen, med ett
  // meddelande om det. Byter man vy själv försvinner meddelandet.
  const [justRegistered, setJustRegistered] = useState(false)

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
      {view === null && <ProblemStatement />}

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

      <Link to="/om" className="info-link">
        Läs mer om tjänsten
      </Link>
    </div>
  )
}

export default Home
