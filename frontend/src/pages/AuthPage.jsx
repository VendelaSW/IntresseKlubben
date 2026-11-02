import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import ForgotPasswordFields from '../components/ForgotPasswordFields'
import LoginFields from '../components/LoginFields'
import PenArrow from '../components/PenArrow'
import RegisterFields from '../components/RegisterFields'
import { useAuth } from '../hooks/useAuth'
import { useGoBack } from '../hooks/useCanGoBack'
import '../styles/startPage.css'

// Inloggning (/logga-in) och registrering (/registrera) på egna sidor, för den nya startsidan (StartPage). Samma
// fält som i Home, där de fortfarande visas inuti sidan tills den nya startsidan ersätter den. "Glömt lösenord?"
// visas här på inloggningssidan. Har man precis skapat ett konto hamnar man på inloggningen, med ett meddelande
// om det.
//
// Sidorna ser ut som den nya startsidan: anteckningsblocket i bakgrunden, formuläret på en lapp med tejp,
// märkpennsknappen och den pennritade pilen tillbaka (se "Inloggning och registrering" i startPage.css).
function AuthPage({ mode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const justRegistered = Boolean(useLocation().state?.justRegistered)
  const [forgot, setForgot] = useState(false)
  const goBack = useGoBack(() => navigate('/'))

  // Redan inloggad: inget att göra här, skicka vidare till kartan.
  if (loading) return null
  if (user) return <Navigate to="/hem" replace />

  return (
    <div className="page home-page home-page-form auth-page start-lined">
      <button type="button" className="auth-back" aria-label="Tillbaka" onClick={goBack}>
        <PenArrow className="auth-back-arrow" />
      </button>
      <section className="hero">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </section>

      <div className="paper-note auth-note">
        {mode === 'register' && (
          <RegisterFields
            onSwitchToLogin={() => navigate('/logga-in', { replace: true })}
            onRegistered={() => navigate('/logga-in', { replace: true, state: { justRegistered: true } })}
          />
        )}

        {mode === 'login' &&
          (forgot ? (
            <ForgotPasswordFields onSwitchToLogin={() => setForgot(false)} />
          ) : (
            <LoginFields
              onSwitchToRegister={() => navigate('/registrera', { replace: true })}
              onForgotPassword={() => setForgot(true)}
              notice={
                justRegistered
                  ? 'Kontot är skapat! Vi har skickat ett mejl för att bekräfta din e-post. Logga in med ditt användarnamn eller din e-post.'
                  : null
              }
            />
          ))}
      </div>
    </div>
  )
}

export default AuthPage
