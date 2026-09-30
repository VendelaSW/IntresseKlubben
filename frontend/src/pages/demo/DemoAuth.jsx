import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DemoBackLink } from '../../components/DemoCards'
import { hasProfile, useDemo } from '../../hooks/useDemo'

// Registrering och inloggning i demon. Inget kontrolleras: registrering
// leder till inloggning, och inloggning skickar dig till profilen om den
// inte är ifylld än, annars direkt till appen. Samma flöde som det riktiga
// ska få när inloggningen är klar.
function DemoAuth({ mode }) {
  const isRegister = mode === 'register'
  const { username: savedUsername, profile, register, login } = useDemo()
  const [username, setUsername] = useState(isRegister ? '' : savedUsername)
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  function handleSubmit(event) {
    event.preventDefault()
    if (isRegister) {
      register(username)
      navigate('/demo/logga-in')
      return
    }
    login(username)
    navigate(hasProfile(profile) ? '/demo/app' : '/demo/profil')
  }

  return (
    <div className="page">
      <DemoBackLink />
      <h1>{isRegister ? 'Registrera dig' : 'Logga in'}</h1>
      {!isRegister && savedUsername && (
        <p className="status-success">Kontot är skapat! Logga in för att fortsätta.</p>
      )}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="demo-username">Användarnamn</label>
        <input
          id="demo-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label htmlFor="demo-password">Lösenord</label>
        <input
          id="demo-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="hint-text">Demo: vilket lösenord som helst fungerar.</p>

        <button type="submit">{isRegister ? 'Registrera dig' : 'Logga in'}</button>
      </form>
      {isRegister ? (
        <Link to="/demo/logga-in" className="info-link">
          Har du redan ett konto? Logga in
        </Link>
      ) : (
        <Link to="/demo/registrera" className="info-link">
          Har du inget konto? Registrera dig
        </Link>
      )}
    </div>
  )
}

export default DemoAuth
