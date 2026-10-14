import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { setStartView } from '../hooks/useStartView'
import { getProfile } from '../services/profile'

// Menyn: profilsidan, som läggs på kartan som ett block (via `onOpen`), lugnt
// läge av/på (via `onToggleCalm`), Avsluta kartan (tillbaka till appens
// vanliga startsida) och sist Logga ut. Appens övriga sidor har egna lappar
// (se MapPageWidgets).
const MENU = [{ id: 'profil', label: 'Profilsida' }]

// Profillappen uppe till höger på kartan, bredvid zoomknapparna: namnet till
// vänster och profilbilden till höger. Ett klick fäller ut menyn (MENU).
// Kartan ligger bakom inloggningen, så användaren finns alltid här.
function MapProfileWidget({ onOpen, calm, onToggleCalm }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getProfile()
      .then((data) => !cancelled && setProfile(data))
      // Utan profil visas användarnamnet och initialen, så inget fel behövs.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  // Menyn stängs med Escape eller ett klick någon annanstans (t.ex. på kartan).
  useEffect(() => {
    if (!open) return
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleLogout() {
    logout()
    navigate('/')
  }

  // Appens vanliga startsida i stället för kartan, även nästa gång (se
  // useStartView och HomeSwitch).
  function exitMap() {
    setStartView('klassisk')
    navigate('/hem')
  }

  const name = profile?.name ?? user.username
  return (
    <div ref={rootRef} className="map-profile-wrap">
      <button
        type="button"
        className={`map-profile${open ? ' is-open' : ''}`}
        aria-label={`Din profil: ${name}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="map-profile-name">{name}</span>
        {profile?.image_url ? (
          <img src={profile.image_url} alt="" className="map-profile-avatar" />
        ) : (
          <span className="map-profile-avatar map-profile-initial" aria-hidden="true">
            {name.trim()[0]?.toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <ul className="map-profile-menu">
          {MENU.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                className="map-profile-menu-item"
                onClick={() => {
                  setOpen(false)
                  onOpen(id)
                }}
              >
                {label}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="map-profile-menu-item"
              onClick={() => {
                setOpen(false)
                onToggleCalm()
              }}
            >
              {calm ? 'Visa kartan' : 'Lugnt läge'}
            </button>
          </li>
          <li>
            <button type="button" className="map-profile-menu-item" onClick={exitMap}>
              Avsluta kartan
            </button>
          </li>
          <li>
            <button type="button" className="map-profile-menu-item" onClick={handleLogout}>
              Logga ut
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export default MapProfileWidget
