import { useState } from 'react'
import { registerUser } from '../services/api'

// Registreringsfälten, tänkta att visas inline på Home (se LoginFields/
// RegisterFields-paret) istället för på en egen sida.
function RegisterFields({ onSwitchToLogin }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
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
      await registerUser(username, email, password)
      setSuccess(true)
      setUsername('')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1>Registrera dig</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="register-username">Användarnamn</label>
        <input
          id="register-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label htmlFor="register-email">E-postadress</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="register-password">Lösenord</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="form-error">{error}</p>}
        {success && <p className="form-success">Kontot är skapat! Du kan nu logga in.</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Registrerar…' : 'Registrera dig'}
        </button>
      </form>
      <button type="button" className="text-button" onClick={onSwitchToLogin}>
        Har du redan ett konto? Logga in
      </button>
    </>
  )
}

export default RegisterFields
