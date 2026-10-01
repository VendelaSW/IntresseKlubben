import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loginUser } from '../services/api'

// Samma fält/logik som LoginForm.jsx, men utan sidans eget skal, så den kan
// visas inline på Home istället för att navigera till en egen sida.
function LoginFields({ onSwitchToRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { access_token } = await loginUser(username, password)
      await login(access_token)
      // Profilsidan visar "Skapa din profil" om det inte finns någon profil
      // än, annars "Min profil". Byts mot huvudsidan när den finns.
      navigate('/profil')
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1>Logga in</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-username">Användarnamn</label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label htmlFor="login-password">Lösenord</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Loggar in…' : 'Logga in'}
        </button>
      </form>
      <button type="button" className="text-button" onClick={onSwitchToRegister}>
        Har du inget konto? Registrera dig
      </button>
    </>
  )
}

export default LoginFields
