import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import InterestTags from '../components/InterestTags'
import ProfileAbout from '../components/ProfileAbout'
import { getMyInterests } from '../services/interests'
import { genderLabel, getProfile } from '../services/profile'

// Hur länge blocket lyfter innan det tas bort (samma som .map-pad.is-leaving).
const LEAVE_MS = 260

// Profilen som ett anteckningsblock som läggs ned på kartan, som om kartan låg
// på ett bord och man lade ett block ovanpå. Blocket faller in, landar med en
// liten studs och lutar lite, som bordet. "Stäng", Escape eller ett klick
// bredvid lyfter bort det igen. Bara läsläge än; "Redigera" leder till
// profilsidan tills redigeringen flyttat in i blocket.
function MapProfilePad({ onClose }) {
  const [profile, setProfile] = useState(null)
  const [interests, setInterests] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [leaving, setLeaving] = useState(false)

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

  // Lyft blocket och ta bort det när det har lyft.
  function close() {
    if (leaving) return
    setLeaving(true)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTimeout(onClose, reduceMotion ? 0 : LEAVE_MS)
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  return (
    // Ett klick på bordet bredvid blocket lyfter bort det.
    <div className="map-pad-stage" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section
        className={`map-pad${leaving ? ' is-leaving' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-pad-title"
      >
        <div className="map-pad-rings" aria-hidden="true" />
        <div className="map-pad-page">
          <div className="map-pad-head">
            <h2 id="map-pad-title" className="map-pad-title">
              Min profil
            </h2>
            <button type="button" className="map-pad-close" onClick={close} aria-label="Stäng">
              ×
            </button>
          </div>

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
                <InterestTags interests={interests} />
              ) : (
                <p className="hint-text">Inga intressen valda än.</p>
              )}

              <Link to="/profil" className="map-tool map-pad-edit">
                Redigera profil
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default MapProfilePad
