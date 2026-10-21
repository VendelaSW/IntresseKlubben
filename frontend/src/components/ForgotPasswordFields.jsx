import { useState } from 'react'
import { forgotPassword } from '../services/api'

// "Glömt lösenord?" på Home, bredvid LoginFields/RegisterFields. Svaret är
// detsamma oavsett om kontot finns, så att det inte går att ta reda på vilka
// konton som finns; därför står det "om" i bekräftelsen.
function ForgotPasswordFields({ onSwitchToLogin }) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [status, setStatus] = useState('form') // 'form' | 'sending' | 'sent'
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setStatus('sending')
    try {
      await forgotPassword(usernameOrEmail)
      setStatus('sent')
    } catch (err) {
      setError(err.message)
      setStatus('form')
    }
  }

  return (
    <>
      <h1>Glömt lösenord</h1>
      {status === 'sent' ? (
        <p className="form-success">
          Om kontot finns har vi skickat ett mejl med en länk för att välja ett nytt lösenord. Länken gäller i en
          timme.
        </p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="forgot-username">Användarnamn eller e-post</label>
          <input
            id="forgot-username"
            type="text"
            autoComplete="username"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Skickar…' : 'Skicka länk'}
          </button>
        </form>
      )}
      <button type="button" className="text-button" onClick={onSwitchToLogin}>
        Tillbaka till inloggningen
      </button>
    </>
  )
}

export default ForgotPasswordFields
