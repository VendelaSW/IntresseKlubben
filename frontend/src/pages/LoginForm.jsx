import { useState } from 'react'
import { Link } from 'react-router-dom'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    // Inloggning kopplas mot backend i en senare ticket.
  }

  return (
    <div className="page">
      <h1>Logga in</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-email">E-post</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

        <button type="submit">Logga in</button>
      </form>
      <Link to="/registrera" className="info-link">
        Har du inget konto? Registrera dig
      </Link>
    </div>
  )
}

export default LoginForm
