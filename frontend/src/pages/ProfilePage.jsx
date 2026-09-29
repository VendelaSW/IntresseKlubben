import { useEffect, useState } from 'react'
import HomeLink from '../components/HomeLink'
import ProfileInterests from '../components/ProfileInterests'
import {
  GENDER_OPTIONS,
  genderLabel,
  getMunicipalities,
  getProfile,
  updateProfile,
} from '../services/profile'

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
  const [municipalities, setMunicipalities] = useState([])

  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState('')
  const [district, setDistrict] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    Promise.all([getProfile(), getMunicipalities()])
      .then(([data, list]) => {
        setProfile(data)
        setMunicipalities(list)
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
    setMunicipalityCode(profile?.municipality_code ?? '')
    setDistrict(profile?.district ?? '')
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
    if (municipalityCode) data.municipality_code = municipalityCode
    if (district.trim()) data.district = district

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

          <label htmlFor="profile-municipality">Kommun</label>
          <select
            id="profile-municipality"
            value={municipalityCode}
            onChange={(e) => setMunicipalityCode(e.target.value)}
          >
            <option value="">Välj...</option>
            {municipalities.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>

          <label htmlFor="profile-district">Stadsdel</label>
          <input
            id="profile-district"
            type="text"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            maxLength={100}
          />

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
        <dt>Kommun</dt>
        <dd>{profile.municipality_name ?? '–'}</dd>
        <dt>Stadsdel</dt>
        <dd>{profile.district ?? '–'}</dd>
      </dl>
      <ProfileInterests />
      <button type="button" className="banner-button" onClick={startEditing}>
        Redigera profil
      </button>
    </div>
  )
}

export default ProfilePage
