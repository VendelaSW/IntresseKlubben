import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import LoginFields from '../components/LoginFields'
import ProblemStatement from '../components/ProblemStatement'
import RegisterFields from '../components/RegisterFields'
import { useAuth } from '../hooks/useAuth'

function Home() {
  const { user, loading } = useAuth()
  const [view, setView] = useState(null) // null | 'login' | 'register'

  // Redan inloggad: inget att göra här, skicka vidare till hubben.
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
          <button type="button" className="primary-button" onClick={() => setView('login')}>
            Logga in
          </button>
          <button type="button" className="primary-button" onClick={() => setView('register')}>
            Registrera dig
          </button>
        </div>
      )}

      {view === 'login' && (
        <>
          <LoginFields onSwitchToRegister={() => setView('register')} />
          <button type="button" className="text-button" onClick={() => setView(null)}>
            ← Tillbaka
          </button>
        </>
      )}

      {view === 'register' && (
        <>
          <RegisterFields onSwitchToLogin={() => setView('login')} />
          <button type="button" className="text-button" onClick={() => setView(null)}>
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
