import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getUserProfile } from '../services/profile'

// Visar en annan användares profil, skrivskyddat. Ingen redigering och
// ingen bilduppladdning här - det är bara ägaren som kan ändra sin profil.
function UserProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'not-found' | 'error'
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    setStatus('loading')
    getUserProfile(username)
      .then((data) => {
        setProfile(data)
        setStatus(data === null ? 'not-found' : 'ready')
      })
      .catch(() => setStatus('error'))
  }, [username])

  const initial = profile?.name?.trim()?.[0]?.toUpperCase() ?? '?'

  // Går tillbaka dit man kom ifrån. Om sidan öppnades direkt (t.ex. en
  // delad länk) finns ingen tidigare sida i appen att gå tillbaka till,
  // och då skulle navigate(-1) ta en ut ur appen - gå till personlistan
  // i stället. window.history.state.idx är satt av react-router och är
  // 0 bara för sidans allra första post i historiken.
  function handleBack() {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate('/personer')
    }
  }

  return (
    <div className="content-stack">
      {status === 'loading' && <p>Laddar profil...</p>}
      {status === 'not-found' && <p className="form-error">Den profilen finns inte.</p>}
      {status === 'error' && <p className="form-error">Kunde inte hämta profilen. Försök igen senare.</p>}

      {status === 'ready' && (
        <>
          <h1>{profile.name ?? 'Profil'}</h1>
          <div className="profile-image">
            {profile.image_url ? (
              <img
                src={profile.image_url}
                alt={`Profilbild för ${profile.name ?? 'användaren'}`}
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar profile-avatar-empty" aria-hidden="true">
                {initial}
              </div>
            )}
          </div>
          <dl className="profile-details">
            <dt>Namn</dt>
            <dd>{profile.name ?? '–'}</dd>
            <dt>Ålder</dt>
            <dd>{profile.age ?? '–'}</dd>
            <dt>Kommun</dt>
            <dd>{profile.municipality_name ?? '–'}</dd>
            <dt>Stadsdel</dt>
            <dd>{profile.district ?? '–'}</dd>
          </dl>
        </>
      )}

      <button type="button" className="text-button" onClick={handleBack}>
        ← Tillbaka
      </button>
    </div>
  )
}

export default UserProfilePage
