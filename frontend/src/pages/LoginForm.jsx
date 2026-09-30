import { useState } from 'react'
import { Link } from 'react-router-dom'
import HomeLink from '../components/HomeLink'
import { loginUser } from '../services/api'

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess(false)
    setSubmitting(true)
    try {
      await loginUser(username, password)
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
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
        {success && <p className="form-success">Inloggad!</p>}

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
