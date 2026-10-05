import { useEffect, useState } from 'react'
import InterestPicker from '../components/InterestPicker'
import InterestTags from '../components/InterestTags'
import ProfileAbout from '../components/ProfileAbout'
import TextareaWithCount from '../components/TextareaWithCount'
import { imageToWebp } from '../services/imageToWebp'
import { addInterest, getAllInterests, getMyInterests, removeInterest } from '../services/interests'
import {
  GENDER_OPTIONS,
  genderLabel,
  getMunicipalities,
  getProfile,
  updateProfile,
  uploadProfileImage,
  uploadProfileWebp,
} from '../services/profile'

// Dagens datum som YYYY-MM-DD i lokal tid (toISOString ger UTC och kan
// visa fel dag runt midnatt).
function todayString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Felmeddelanden från servern saknar ibland punkt i slutet, och då skulle en
// mening som läggs efter dem gå ihop med dem.
function withPeriod(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

// Visar profilbilden. Själva bildbytet (knappen) finns bara när editable är
// satt, alltså i "Redigera profil", inte i den vanliga profilvyn.
function ProfileImage({ profile, onUploaded, editable = false }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(event) {
    const file = event.target.files[0]
    // Nollställ så att samma fil kan väljas igen efter ett fel.
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      onUploaded(await uploadProfileImage(file))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const initial = profile.name?.trim()?.[0]?.toUpperCase() ?? '?'
  return (
    <div className="profile-image">
      {profile.image_url ? (
        <img src={profile.image_url} alt={`Profilbild för ${profile.name ?? 'dig'}`} className="profile-avatar" />
      ) : (
        <div className="profile-avatar profile-avatar-empty" aria-hidden="true">
          {initial}
        </div>
      )}
      {editable && (
        <label className={`secondary-button button-small${uploading ? ' is-disabled' : ''}`}>
          {uploading ? 'Laddar upp...' : profile.image_url ? 'Byt bild' : 'Lägg till bild'}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={handleFile}
            disabled={uploading}
          />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// Bildväljare för "Skapa din profil". Profilen finns inte än, så bilden görs
// om till WebP direkt men laddas upp först när formuläret sparas.
function NewProfileImage({ name, image, onChange }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!image) return undefined
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  async function handleFile(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      onChange(await imageToWebp(file))
    } catch (err) {
      setError(err.message)
    }
  }

  const initial = name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <div className="profile-image">
      {image && preview ? (
        <img src={preview} alt="Förhandsvisning av din profilbild" className="profile-avatar" />
      ) : (
        <div className="profile-avatar profile-avatar-empty" aria-hidden="true">
          {initial}
        </div>
      )}
      <label className="secondary-button button-small">
        {image ? 'Byt bild' : 'Lägg till bild'}
        <input type="file" accept="image/*" className="visually-hidden" onChange={handleFile} />
      </label>
      {image && <p className="hint-text">Bilden laddas upp när du sparar profilen.</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

function ProfilePage() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [profile, setProfile] = useState(null) // null = ingen profil skapad än
  const [editing, setEditing] = useState(false)
  const [municipalities, setMunicipalities] = useState([])
  const [allInterests, setAllInterests] = useState([])
  const [myInterests, setMyInterests] = useState([])

  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState('')
  const [district, setDistrict] = useState('')
  const [aboutText, setAboutText] = useState('')
  // Valda intressen i formuläret. Sparas först när man trycker Spara.
  const [draftInterests, setDraftInterests] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // Bild vald i "Skapa din profil", laddas upp efter att profilen sparats.
  const [pendingImage, setPendingImage] = useState(null)
  const [imageNotice, setImageNotice] = useState('')

  useEffect(() => {
    // Själva inloggningskollen sköts redan av ProtectedRoute, så vi kan
    // anta att det finns en giltig token när den här sidan visas.
    Promise.all([getProfile(), getMunicipalities(), getAllInterests(), getMyInterests()])
      .then(([data, list, all, mine]) => {
        setProfile(data)
        setMunicipalities(list)
        setAllInterests(all)
        setMyInterests(mine)
        setDraftInterests(mine)
        // Ingen profil än → visa formuläret direkt.
        setEditing(data === null)
        setStatus('ready')
      })
      .catch((err) => {
        // 401 hanteras globalt (api.js skickar 'auth:expired', useAuth loggar
        // ut, ProtectedRoute skickar vidare), inget att göra här mer än att
        // inte visa felsidan i onödan.
        if (err.status !== 401) setStatus('error')
      })
  }, [])

  function startEditing() {
    setName(profile?.name ?? '')
    setBirthDate(profile?.birth_date ?? '')
    setGender(profile?.gender ?? '')
    setMunicipalityCode(profile?.municipality_code ?? '')
    setDistrict(profile?.district ?? '')
    setAboutText(profile?.profile_text ?? '')
    setDraftInterests(myInterests)
    setFormError('')
    setEditing(true)
  }

  function toggleInterest(id, add) {
    setDraftInterests((current) =>
      add ? [...current, allInterests.find((i) => i.id === id)] : current.filter((i) => i.id !== id),
    )
  }

  // Skickar bara skillnaden mot det som redan är sparat.
  async function saveInterests() {
    const savedIds = new Set(myInterests.map((i) => i.id))
    const draftIds = new Set(draftInterests.map((i) => i.id))
    await Promise.all([
      ...draftInterests.filter((i) => !savedIds.has(i.id)).map((i) => addInterest(i.id)),
      ...myInterests.filter((i) => !draftIds.has(i.id)).map((i) => removeInterest(i.id)),
    ])
    // allInterests är sorterad på namn, så listan behåller samma ordning.
    setMyInterests(allInterests.filter((i) => draftIds.has(i.id)))
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
    // Om mig skickas alltid: en tom text tömmer fältet i backend.
    data.profile_text = aboutText

    // 1. Profilen. Misslyckas den sparas inget annat heller.
    let saved
    try {
      saved = await updateProfile(data)
    } catch (err) {
      setFormError(err.message)
      setSaving(false)
      return
    }

    // 2. Profilen finns nu, så en bild vald i "Skapa din profil" kan laddas upp.
    //    Misslyckas det är profilen ändå sparad, och bilden kan läggas till igen.
    setImageNotice('')
    if (pendingImage) {
      try {
        saved = await uploadProfileWebp(pendingImage)
      } catch (err) {
        setImageNotice(`Profilen sparades, men bilden kunde inte laddas upp: ${err.message}`)
      }
      setPendingImage(null)
    }
    setProfile(saved)

    // 3. Intressena. Misslyckas de stannar formuläret kvar så att man kan försöka igen.
    try {
      await saveInterests()
    } catch (err) {
      setFormError(err.message)
      setSaving(false)
      return
    }

    setEditing(false)
    setSaving(false)
  }

  if (status === 'loading') {
    return (
      <div className="content-stack">
        <p>Laddar profil...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="content-stack">
        <h1>Min profil</h1>
        <p className="form-error">Kunde inte hämta profilen. Försök igen senare.</p>
      </div>
    )
  }

  if (editing) {
    const isNew = profile === null
    return (
      <div className="card card-wide content-stack">
        <h1>{isNew ? 'Skapa din profil' : 'Redigera profil'}</h1>
        {isNew && (
          <p className="profile-intro">
            Berätta lite om dig själv så att andra i klubben vet vem du är.
          </p>
        )}
        {/* Befintlig profil: bilden sparas direkt, oberoende av Spara-knappen.
            Ny profil: bilden väntar och laddas upp efter att profilen sparats. */}
        {isNew ? (
          <NewProfileImage name={name} image={pendingImage} onChange={setPendingImage} />
        ) : (
          <>
            <ProfileImage
              profile={profile}
              onUploaded={(updated) => {
                setImageNotice('')
                setProfile(updated)
              }}
              editable
            />
            {imageNotice && <p className="form-error">{imageNotice}</p>}
          </>
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

          <label htmlFor="profile-about">Om mig</label>
          <TextareaWithCount
            id="profile-about"
            value={aboutText}
            onChange={(e) => setAboutText(e.target.value)}
            maxLength={800}
          />

          <section className="profile-interests">
            <h2>Intressen</h2>
            <p className="hint-text">Klicka för att välja.</p>
            <InterestPicker allInterests={allInterests} selected={draftInterests} onToggle={toggleInterest} />
          </section>

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
    <div className="card card-wide content-stack">
      <h1>Min profil</h1>
      {imageNotice && (
        <p className="form-error">{withPeriod(imageNotice)} Försök igen under Redigera profil.</p>
      )}
      <ProfileImage profile={profile} />
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
      <ProfileAbout text={profile.profile_text} />
      <section className="profile-interests">
        <h2>Intressen</h2>
        {myInterests.length > 0 ? (
          <InterestTags interests={myInterests} />
        ) : (
          <p className="hint-text">Inga intressen valda än.</p>
        )}
      </section>
      <button type="button" className="primary-button" onClick={startEditing}>
        Redigera profil
      </button>
    </div>
  )
}

export default ProfilePage
