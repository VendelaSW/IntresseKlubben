import { useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import { useAuth } from '../hooks/useAuth'
import { useLinkToken } from '../hooks/useLinkToken'
import { resetPassword } from '../services/api'

// Hit leder länken i mejlet "Välj ett nytt lösenord" (/aterstall?token=...).
// Andra inloggningar slutar gälla när lösenordet är bytt, även en i den här
// webbläsaren, så man loggas ut här också och loggar in med det nya.
function ResetPasswordPage() {
  const { logout } = useAuth()
  const token = useLinkToken()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [status, setStatus] = useState('form') // 'form' | 'saving' | 'done'
  const [error, setError] = useState(token ? '' : 'Länken saknar kod. Öppna länken i mejlet igen.')

  async function handleSubmit(event) {
    event.preventDefault()
    if (password !== repeat) {
      setError('Lösenorden är inte likadana.')
      return
    }
    setError('')
    setStatus('saving')
    try {
      await resetPassword(token, password)
      // Den här webbläsarens inloggning gäller inte längre (ofarligt om man inte var inloggad).
      logout()
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('form')
    }
  }

  return (
    <div className="page service-page">
      <Link to="/" className="service-logo-link">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </Link>
      <h1 className="service-heading">Välj nytt lösenord</h1>
      {status === 'done' ? (
        <>
          <p className="form-success">Klart! Logga in med ditt nya lösenord.</p>
          <Link to="/" className="primary-button">
            Logga in
          </Link>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="reset-password">Nytt lösenord</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <label htmlFor="reset-password-repeat">Skriv det nya lösenordet igen</label>
          <input
            id="reset-password-repeat"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
          <p className="hint-text">Minst 8 tecken.</p>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={!token || status === 'saving'}>
            {status === 'saving' ? 'Sparar...' : 'Spara nytt lösenord'}
          </button>
        </form>
      )}
    </div>
  )
}

export default ResetPasswordPage
