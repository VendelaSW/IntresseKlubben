import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getUserProfile } from '../services/profile'

// Visar en annan användares profil, skrivskyddat. Ingen redigering och
// ingen bilduppladdning här - det är bara ägaren som kan ändra sin profil.
function UserProfilePage() {
  const { username } = useParams()
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

  if (status === 'loading') {
    return (
      <div className="content-stack">
        <p>Laddar profil...</p>
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="content-stack">
        <p className="form-error">Den profilen finns inte.</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="content-stack">
        <p className="form-error">Kunde inte hämta profilen. Försök igen senare.</p>
      </div>
    )
  }

  const initial = profile.name?.trim()?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="content-stack">
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
    </div>
  )
}

export default UserProfilePage
