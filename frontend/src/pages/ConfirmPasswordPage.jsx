import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import { useAuth } from '../hooks/useAuth'
import { useLinkToken } from '../hooks/useLinkToken'
import { confirmPasswordChange } from '../services/api'

// Hit leder länken i mejlet "Bekräfta ditt nya lösenord"
// (/bekrafta-losenord?token=...). Bytet görs direkt när sidan öppnas, som när
// man bekräftar e-posten. Andra inloggningar slutar gälla, även en i den här
// webbläsaren, så man loggas ut här också och loggar in med det nya.
function ConfirmPasswordPage() {
  const { logout } = useAuth()
  const token = useLinkToken()
  const started = useRef(false)
  const [status, setStatus] = useState(token ? 'confirming' : 'error') // 'confirming' | 'done' | 'error'
  const [error, setError] = useState(token ? '' : 'Länken saknar kod. Öppna länken i mejlet igen.')

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    confirmPasswordChange(token)
      .then(() => {
        // Den här webbläsarens inloggning gäller inte längre (ofarligt om man inte var inloggad).
        logout()
        setStatus('done')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [token, logout])

  return (
    <div className="page service-page">
      <Link to="/" className="service-logo-link">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </Link>
      <h1 className="service-heading">Nytt lösenord</h1>
      {status === 'confirming' && <p className="hint-text">Byter lösenord...</p>}
      {status === 'done' && <p className="form-success">Ditt lösenord är bytt. Logga in med det nya.</p>}
      {status === 'error' && <p className="form-error">{error}</p>}
      {status !== 'confirming' && (
        <Link to="/" className="primary-button">
          Logga in
        </Link>
      )}
    </div>
  )
}

export default ConfirmPasswordPage
