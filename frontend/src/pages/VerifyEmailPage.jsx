import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import { useAuth } from '../hooks/useAuth'
import { verifyEmail } from '../services/api'

// Hit leder länken i bekräftelsemejlet (/verifiera?token=...). Koden skickas
// till backend härifrån och inte direkt via länken, eftersom e-postprogram ofta
// öppnar länkar i förväg och då skulle förbruka den. Koden tas bort ur
// adressfältet direkt, så att den inte ligger kvar i historiken. Fungerar både
// inloggad och utloggad, t.ex. om mejlet öppnas på en annan enhet.
function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  // Läses en gång: adressen töms nedan, och StrictMode kör effekten två gånger i utvecklingsläget.
  const token = useRef(searchParams.get('token'))
  const started = useRef(false)
  const [status, setStatus] = useState(token.current ? 'verifying' : 'error') // 'verifying' | 'done' | 'error'
  const [error, setError] = useState(token.current ? '' : 'Länken saknar kod. Öppna länken i mejlet igen.')

  useEffect(() => {
    if (!token.current || started.current) return
    started.current = true
    navigate('/verifiera', { replace: true })
    verifyEmail(token.current)
      .then(() => setStatus('done'))
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [navigate])

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
