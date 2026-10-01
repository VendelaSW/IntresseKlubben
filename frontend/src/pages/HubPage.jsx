import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getMyInterests } from '../services/interests'
import { getProfile } from '../services/profile'

// Flikarna som fungerar på riktigt. Hela kortet är en länk, och knapptexten
// gör det tydligt att man kan klicka.
const SECTIONS = [
  {
    to: '/personer',
    title: 'Hitta folk som gillar samma saker',
    text: 'Bläddra bland andra i appen och filtrera på intresse och kommun. Klicka på någon för att se deras profil.',
    action: 'Hitta personer',
  },
  {
    to: '/klubbar',
    title: 'Hitta ditt gäng',
    text: 'Gå med i en klubb för något du gillar, eller starta en egen i din kommun och samla andra som delar intresset.',
    action: 'Utforska klubbar',
  },
  {
    to: '/meddelanden',
    title: 'Håll kontakten',
    text: 'Se dina konversationer och skicka meddelanden till folk du hittat i klubben.',
    action: 'Öppna meddelanden',
  },
]

const swedishList = new Intl.ListFormat('sv', { type: 'conjunction' })

// Huvudsidan efter inloggning: en personlig välkomst och en väg vidare till
// personer och klubbar. Listorna själva finns på respektive sida.
function HubPage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'no-profile' | 'error'
  const [profile, setProfile] = useState(null)
  const [interests, setInterests] = useState([])

  useEffect(() => {
    Promise.all([getProfile(), getMyInterests()])
      .then(([data, mine]) => {
        setProfile(data)
        setInterests(mine)
        setStatus(data === null ? 'no-profile' : 'ready')
      })
      .catch((err) => {
        // 401 hanteras globalt (useAuth loggar ut och ProtectedRoute skickar vidare).
        if (err.status !== 401) setStatus('error')
      })
  }, [])

  // Utan profil finns inget att matcha på, så skicka till "Skapa din profil".
  if (status === 'no-profile') return <Navigate to="/profil" replace />

  if (status === 'loading') {
    return (
      <div className="content-stack">
        <p>Laddar...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="content-stack">
        <p className="form-error">Kunde inte hämta din startsida. Försök igen senare.</p>
      </div>
    )
  }

  const likes = swedishList.format(interests.map((i) => i.name.toLowerCase()))

  return (
    <div className="hub">
      <section className="hub-hero">
        <h1 className="hub-title">
          Hej <span className="highlight">{profile.name}</span>!
        </h1>
        {interests.length > 0 ? (
          <p className="hub-lead">
            Du gillar {likes}. Här hittar du andra som också gör det.
          </p>
        ) : (
          <p className="hub-lead">
            Välj några intressen på <Link to="/profil" className="info-link">din profil</Link> så
            hittar vi personer och klubbar för dig.
          </p>
        )}
      </section>

      <section className="hub-cards" aria-label="Kom igång">
        {SECTIONS.map((section) => (
          <Link key={section.to} to={section.to} className="hub-card">
            <h2 className="hub-card-title">{section.title}</h2>
            <p className="hub-card-text">{section.text}</p>
            <span className="primary-button hub-card-action">{section.action} →</span>
          </Link>
        ))}
      </section>
    </div>
  )
}

export default HubPage
