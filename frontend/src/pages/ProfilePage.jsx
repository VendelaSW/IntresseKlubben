import { useEffect, useState } from 'react'
import BlockedUsers from '../components/BlockedUsers'
import DeleteAccount from '../components/DeleteAccount'
import InterestExplorer from '../components/InterestExplorer'
import ProfileAbout from '../components/ProfileAbout'
import TextareaWithCount from '../components/TextareaWithCount'
import { addMyEmail, getCurrentUser } from '../services/api'
import { imageToWebp } from '../services/imageToWebp'
import { addInterest, getMyInterests, removeInterest } from '../services/interests'
import {
  GENDER_OPTIONS,
  createProfile,
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

// Ens e-post. Konton som skapades innan e-post krävdes vid registrering
// saknar den, och får här lägga till den (tänkt att behövas för att kunna
// återställa lösenordet, när det finns). En befintlig e-post går inte att
// ändra här.
function ProfileEmail() {
  const [email, setEmail] = useState(undefined) // undefined = laddar, null = saknas
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCurrentUser()
      .then((me) => setEmail(me.email))
      .catch(() => setError('Kunde inte hämta din e-post.'))
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const me = await addMyEmail(draft)
      setEmail(me.email)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (email === undefined && !error) return null

  return (
    <section className="profile-email">
      <h2>E-post</h2>
      {email ? (
        <>
          <p className="card-text">{email}</p>
          {saved && <p className="status-success">E-posten är sparad.</p>}
          <p className="hint-text">Syns bara för dig.</p>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <p className="hint-text">
            Lägg till din e-post. Den syns bara för dig.
          </p>
          <label htmlFor="profile-email">E-postadress</label>
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Sparar...' : 'Spara e-post'}
          </button>
        </form>
      )}
    </section>
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
  const [myInterests, setMyInterests] = useState([])

  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [genderSearchable, setGenderSearchable] = useState(false)
  const [municipalityCode, setMunicipalityCode] = useState('')
  const [district, setDistrict] = useState('')
  const [aboutText, setAboutText] = useState('')
  // Valda intressen när profilen skapas. Sparas tillsammans med profilen.
  // (En befintlig profils intressen ändras direkt i "Vad gillar du?".)
  const [draftInterests, setDraftInterests] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // Bild vald i "Skapa din profil", laddas upp efter att profilen sparats.
  const [pendingImage, setPendingImage] = useState(null)
  const [imageNotice, setImageNotice] = useState('')

  useEffect(() => {
    // Själva inloggningskollen sköts redan av ProtectedRoute, så vi kan
    // anta att det finns en giltig token när den här sidan visas.
    Promise.all([getProfile(), getMunicipalities(), getMyInterests()])
      .then(([data, list, mine]) => {
        setProfile(data)
        setMunicipalities(list)
        setMyInterests(mine)
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
    setGenderSearchable(profile?.gender_searchable ?? false)
    setMunicipalityCode(profile?.municipality_code ?? '')
    setDistrict(profile?.district ?? '')
    setAboutText(profile?.profile_text ?? '')
    setFormError('')
    setEditing(true)
  }

  const byName = (a, b) => a.name.localeCompare(b.name, 'sv')

  // "Vad gillar du?" på profilen sparar direkt. Backend svarar med den
  // uppdaterade listan, och stoppar att det sista intresset tas bort.
  async function addSavedInterest(interest) {
    setMyInterests(await addInterest(interest.id))
  }

  async function removeSavedInterest(interest) {
    setMyInterests(await removeInterest(interest.id))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    const isNew = profile === null
    if (isNew && draftInterests.length === 0) {
      setFormError('Välj minst ett intresse.')
      return
    }
    setSaving(true)

    // Namn, födelsedatum, kön, kommun och Om mig är obligatoriska och skickas
    // alltid med. Stadsdel är valfri och skickas bara om den är ifylld.
    const data = {
      name,
      birth_date: birthDate,
      gender,
      gender_searchable: genderSearchable,
      municipality_code: municipalityCode,
      profile_text: aboutText,
    }
    if (district.trim()) data.district = district

    // 1. Profilen. Misslyckas den sparas inget annat heller. En ny profil
    //    skapas tillsammans med intressena i samma anrop, en befintlig ändras.
    let saved
    try {
      saved = isNew
        ? await createProfile({ ...data, interest_ids: draftInterests.map((i) => i.id) })
        : await updateProfile(data)
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

    // 3. En ny profil sparade intressena i steg 1.
    if (isNew) setMyInterests([...draftInterests].sort(byName))

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
            required
          />

          <label htmlFor="profile-gender">Kön</label>
          <select id="profile-gender" value={gender} onChange={(e) => setGender(e.target.value)} required>
            <option value="">Välj...</option>
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={genderSearchable}
              onChange={(e) => setGenderSearchable(e.target.checked)}
            />{' '}
            Låt andra hitta mig när de filtrerar på kön (då kan de räkna ut mitt kön)
          </label>

          <label htmlFor="profile-municipality">Kommun</label>
          <select
            id="profile-municipality"
            value={municipalityCode}
            onChange={(e) => setMunicipalityCode(e.target.value)}
            required
          >
            <option value="">Välj...</option>
            {municipalities.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>

          <label htmlFor="profile-district">Stadsdel (valfritt)</label>
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
            required
          />

          {/* En ny profil väljer intressen här (minst ett). En befintlig ändrar
              dem i "Vad gillar du?" på profilen. */}
          {isNew && (
            <InterestExplorer
              card={false}
              selected={draftInterests}
              onAdd={(interest) => setDraftInterests((current) => [...current, interest].sort(byName))}
              onRemove={(interest) => setDraftInterests((current) => current.filter((i) => i.id !== interest.id))}
            />
          )}

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
    <div className="profile-layout">
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
        <dt>Sökbar på kön</dt>
        <dd>{profile.gender_searchable ? 'Ja' : 'Nej'}</dd>
        <dt>Kommun</dt>
        <dd>{profile.municipality_name ?? '–'}</dd>
        <dt>Stadsdel</dt>
        <dd>{profile.district ?? '–'}</dd>
      </dl>
      <ProfileEmail />
      <ProfileAbout text={profile.profile_text} />
      <BlockedUsers />
      <button type="button" className="primary-button" onClick={startEditing}>
        Redigera profil
      </button>
      <DeleteAccount />
    </div>
    {/* Intressena som ett eget vitt kort bredvid profilen (under på mobil).
        Ändringar sparas direkt. */}
    <InterestExplorer selected={myInterests} onAdd={addSavedInterest} onRemove={removeSavedInterest} />
    </div>
  )
}

export default ProfilePage
