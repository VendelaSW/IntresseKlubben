import { useEffect, useState } from 'react'
import HomeLink from '../components/HomeLink'
import ProfileInterests from '../components/ProfileInterests'
import { GENDER_OPTIONS, genderLabel, getProfile, updateProfile } from '../services/profile'

// Dagens datum som YYYY-MM-DD i lokal tid (toISOString ger UTC och kan
// visa fel dag runt midnatt).
function todayString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ProfilePage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [profile, setProfile] = useState(null) // null = ingen profil skapad än
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    getProfile()
      .then((data) => {
        setProfile(data)
        // Ingen profil än → visa formuläret direkt.
        setEditing(data === null)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  function startEditing() {
    setName(profile?.name ?? '')
    setBirthDate(profile?.birth_date ?? '')
    setGender(profile?.gender ?? '')
    setFormError('')
    setEditing(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')

    // Skicka bara ifyllda fält. Tomma fält lämnar backend orörda.
    const data = { name }
    if (birthDate) data.birth_date = birthDate
    if (gender) data.gender = gender

    try {
      const saved = await updateProfile(data)
      setProfile(saved)
      setEditing(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="page">
        <HomeLink />
        <p>Laddar profil...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="page">
        <HomeLink />
        <h1>Min profil</h1>
        <p className="form-error">Kunde inte hämta profilen. Försök igen senare.</p>
      </div>
    )
  }

  if (editing) {
    const isNew = profile === null
    return (
      <div className="page">
        <HomeLink />
        <h1>{isNew ? 'Skapa din profil' : 'Redigera profil'}</h1>
        {isNew && (
          <p className="profile-intro">
            Berätta lite om dig själv så att andra i klubben vet vem du är.
          </p>
        )}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="profile-name">Namn</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
          />

          <label htmlFor="profile-birth-date">Födelsedatum</label>
          <input
            id="profile-birth-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={todayString()}
          />

          <label htmlFor="profile-gender">Kön</label>
          <select id="profile-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Välj...</option>
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <ProfileInterests />

          {formError && <p className="form-error">{formError}</p>}

          <button type="submit" disabled={saving}>
            {saving ? 'Sparar...' : 'Spara'}
          </button>
          {!isNew && (
            <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
              Avbryt
            </button>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="page">
      <HomeLink />
      <h1>Min profil</h1>
      <dl className="profile-details">
        <dt>Namn</dt>
        <dd>{profile.name ?? '–'}</dd>
        <dt>Ålder</dt>
        <dd>{profile.age ?? '–'}</dd>
        <dt>Kön</dt>
        <dd>{genderLabel(profile.gender) ?? '–'}</dd>
      </dl>
      <ProfileInterests />
      <button type="button" className="banner-button" onClick={startEditing}>
        Redigera profil
      </button>
    </div>
  )
}

export default ProfilePage
