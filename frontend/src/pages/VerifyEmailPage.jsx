import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import { useAuth } from '../hooks/useAuth'
import { useLinkToken } from '../hooks/useLinkToken'
import { verifyEmail } from '../services/api'

// Hit leder länken i bekräftelsemejlet (/verifiera?token=...). Koden skickas
// till backend härifrån och inte direkt via länken, eftersom e-postprogram ofta
// öppnar länkar i förväg och då skulle förbruka den. Fungerar både inloggad och
// utloggad, t.ex. om mejlet öppnas på en annan enhet.
function VerifyEmailPage() {
  const { user } = useAuth()
  const token = useLinkToken()
  const started = useRef(false)
  const [status, setStatus] = useState(token ? 'verifying' : 'error') // 'verifying' | 'done' | 'error'
  const [error, setError] = useState(token ? '' : 'Länken saknar kod. Öppna länken i mejlet igen.')

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    verifyEmail(token)
      .then(() => setStatus('done'))
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [token])

  return (
    <div className="page service-page">
      <Link to="/" className="service-logo-link">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </Link>
      <h1 className="service-heading">Bekräfta e-post</h1>
      {status === 'verifying' && <p className="hint-text">Bekräftar...</p>}
      {status === 'done' && <p className="form-success">Tack! Din e-postadress är bekräftad.</p>}
      {status === 'error' && <p className="form-error">{error}</p>}
      {status !== 'verifying' &&
        (user ? (
          <Link to="/profil" className="primary-button">
            Till din profil
          </Link>
        ) : (
          <Link to="/" className="primary-button">
            Logga in
          </Link>
        ))}
    </div>
  )
}

export default VerifyEmailPage
