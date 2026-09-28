import { useState } from 'react'
import { Link } from 'react-router-dom'

function RegisterForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    // Registrering kopplas mot backend i en senare ticket.
  }

  return (
    <div className="page">
      <h1>Registrera dig</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="register-name">Namn</label>
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label htmlFor="register-email">E-post</label>
        <input
          id="register-email"
          type="email"
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

        <button type="submit">Registrera dig</button>
      </form>
      <Link to="/logga-in" className="info-link">
        Har du redan ett konto? Logga in
      </Link>
    </div>
  )
}

export default RegisterForm
