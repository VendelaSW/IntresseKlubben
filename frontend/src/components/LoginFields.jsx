import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loginUser } from '../services/api'

// Inloggningsfälten, tänkta att visas inline på Home (se LoginFields/
// RegisterFields-paret) istället för på en egen sida.
// `notice` är ett meddelande överst, t.ex. att kontot just har skapats.
function LoginFields({ onSwitchToRegister, notice }) {
  // Användarnamn eller e-post, i samma fält.
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
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
      const { access_token, user } = await loginUser(usernameOrEmail, password)
      login(access_token, user)
      // Hubben skickar vidare till "Skapa din profil" om profilen saknas.
      navigate('/hem')
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1>Logga in</h1>
      {notice && <p className="form-success">{notice}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-username">Användarnamn eller e-post</label>
        <input
          id="login-username"
          type="text"
          autoComplete="username"
          value={usernameOrEmail}
          onChange={(e) => setUsernameOrEmail(e.target.value)}
          required
        />

        <label htmlFor="login-password">Lösenord</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
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
