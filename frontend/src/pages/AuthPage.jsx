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
// Startsidan visar samma lapp (AuthNote) i en ruta ovanpå sidan i stället.
function AuthPage({ mode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const justRegistered = Boolean(useLocation().state?.justRegistered)
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

      <AuthNote
        mode={mode}
        justRegistered={justRegistered}
        onSwitch={(next, state) => navigate(next === 'register' ? '/registrera' : '/logga-in', { replace: true, state })}
      />
    </div>
  )
}

// Lappen med inloggningen (`mode` 'login', med "Glömt lösenord?") eller registreringen ('register'). `onSwitch(mode,
// state)` byter mellan dem; efter en registrering byts den till inloggningen med `{ justRegistered: true }`, och
// `justRegistered` visar då att kontot är skapat. `onClose` (valfri) ger lappen ett kryss uppe i hörnet, när den
// visas i en ruta.
export function AuthNote({ mode, justRegistered = false, onSwitch, onClose }) {
  const [forgot, setForgot] = useState(false)

  return (
    <div className="paper-note auth-note">
      {onClose && (
        <button type="button" className="auth-note-close" aria-label="Stäng" onClick={onClose}>
          ×
        </button>
      )}
      {mode === 'register' && (
        <RegisterFields
          onSwitchToLogin={() => onSwitch('login')}
          onRegistered={() => onSwitch('login', { justRegistered: true })}
        />
      )}

      {mode === 'login' &&
        (forgot ? (
          <ForgotPasswordFields onSwitchToLogin={() => setForgot(false)} />
        ) : (
          <LoginFields
            onSwitchToRegister={() => onSwitch('register')}
            onForgotPassword={() => setForgot(true)}
            notice={
              justRegistered
                ? 'Kontot är skapat! Vi har skickat ett mejl för att bekräfta din e-post. Logga in med ditt användarnamn eller din e-post.'
                : null
            }
          />
        ))}
    </div>
  )
}

export default AuthPage
