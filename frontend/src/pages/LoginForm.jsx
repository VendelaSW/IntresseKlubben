import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import HomeLink from '../components/HomeLink'
import { loginUser } from '../services/api'
import { setToken } from '../services/auth'

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { access_token } = await loginUser(username, password)
      setToken(access_token)
      // Profilsidan visar "Skapa din profil" om det inte finns någon profil
      // än, annars "Min profil". Byts mot huvudsidan när den finns.
      navigate('/profil')
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <HomeLink />
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
      <Link to="/registrera" className="info-link">
        Har du inget konto? Registrera dig
      </Link>
    </div>
  )
}

export default LoginForm
