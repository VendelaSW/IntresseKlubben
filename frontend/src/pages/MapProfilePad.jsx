import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MapPad from './MapPad'
import InterestTree, { PROFILE_MAX_SUBS, profileTree } from '../components/InterestTree'
import ProfileAbout from '../components/ProfileAbout'
import { getMyInterests } from '../services/interests'
import { genderLabel, getProfile } from '../services/profile'

// Profilen som ett anteckningsblock på kartan (se MapPad), i läsläge.
// "Redigera profil" anropar `onEdit`, som öppnar profilformuläret i ett
// block på kartan (se MapPagePad).
function MapProfilePad({ onClose, onEdit }) {
  const [profile, setProfile] = useState(null)
  const [interests, setInterests] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let cancelled = false
    Promise.all([getProfile(), getMyInterests()])
      .then(([data, mine]) => {
        if (cancelled) return
        setProfile(data)
        setInterests(mine)
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <MapPad title="Min profil" onClose={onClose}>
      {status === 'loading' && <p className="hint-text">Laddar...</p>}
      {status === 'error' && <p className="form-error">Kunde inte hämta profilen. Försök igen senare.</p>}
      {status === 'ready' && profile === null && (
        <p>
          Du har ingen profil än. <Link to="/profil">Skapa din profil</Link>
        </p>
      )}
      {status === 'ready' && profile && (
        <>
          <div className="map-pad-who">
            {profile.image_url ? (
              <img src={profile.image_url} alt="" className="map-pad-avatar" />
            ) : (
              <span className="map-pad-avatar map-profile-initial" aria-hidden="true">
                {(profile.name ?? '?').trim()[0]?.toUpperCase()}
              </span>
            )}
            <div>
              <p className="map-pad-name">{profile.name}</p>
              <p className="map-pad-where">
                {[profile.age && `${profile.age} år`, profile.district, profile.municipality_name]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <dl className="map-pad-details">
            <dt>Kön</dt>
            <dd>{genderLabel(profile.gender) ?? '–'}</dd>
            <dt>Sökbar på kön</dt>
            <dd>{profile.gender_searchable ? 'Ja' : 'Nej'}</dd>
          </dl>

          <ProfileAbout text={profile.profile_text} />

          <p className="map-pad-subheading">Intressen</p>
          {interests.length > 0 ? (
            <InterestTree proposals={profileTree(interests)} align="start" maxSubs={PROFILE_MAX_SUBS} />
          ) : (
            <p className="hint-text">Inga intressen valda än.</p>
          )}

          <button type="button" className="map-tool map-pad-edit" onClick={onEdit}>
            Redigera profil
          </button>
        </>
      )}
    </MapPad>
  )
}

export default MapProfilePad
