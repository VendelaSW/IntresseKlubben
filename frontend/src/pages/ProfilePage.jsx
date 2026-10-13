import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BlockedUsers from '../components/BlockedUsers'
import DeleteAccount from '../components/DeleteAccount'
import InterestExplorer from '../components/InterestExplorer'
import ProfileAbout from '../components/ProfileAbout'
import TextareaWithCount from '../components/TextareaWithCount'
import { useAuth } from '../hooks/useAuth'
import { checkAvailability, getCurrentUser, updateAccount } from '../services/api'
import { clearProfileDraft, loadProfileDraft, saveProfileDraft } from '../services/profileDraft'
import { resizeProfileImage } from '../services/resizeProfileImage'
import { addInterest, getMyInterests, removeInterest } from '../services/interests'
import {
  GENDER_OPTIONS,
  createProfile,
  genderLabel,
  getMunicipalities,
  getProfile,
  updateProfile,
  uploadProfileImage,
  uploadResizedImage,
} from '../services/profile'

// Så länge kontrollen av användarnamn/e-post väntar efter senaste
// tangenttrycket, så att inte varje bokstav blir ett anrop.
const AVAILABILITY_DELAY_MS = 400

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

// Bildväljare för "Skapa din profil". Profilen finns inte än, så bilden skalas
// om direkt men laddas upp först när formuläret sparas.
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
      onChange(await resizeProfileImage(file))
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
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  // ?lista=1: formuläret där man väljer intressen ur listan i stället för att gå igenom intervjun. Dit länkar
  // intervjun när AI:n inte kan tolka texten.
  const [searchParams] = useSearchParams()
  const listMode = searchParams.has('lista')
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [profile, setProfile] = useState(null) // null = ingen profil skapad än
  // Kontouppgifterna (användarnamn och e-post) från /users/me. Visas i
  // profilens lista och ändras i "Redigera profil". E-posten syns bara här.
  const [account, setAccount] = useState(null)
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
  // Kontouppgifterna i "Redigera profil". Lösenordet krävs bara om man ändrar dem.
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  // "Upptaget"-meddelanden medan man skriver (null = ledigt eller oförändrat).
  const [availability, setAvailability] = useState({ username: null, email: null })
  const availabilityRequest = useRef(0)

  useEffect(() => {
    // Själva inloggningskollen sköts redan av ProtectedRoute, så vi kan
    // anta att det finns en giltig token när den här sidan visas.
    Promise.all([getProfile(), getMunicipalities(), getMyInterests(), getCurrentUser()])
      .then(([data, list, mine, me]) => {
        // Ingen profil än → intervjun, där profilen skapas. Med ?lista=1 visas formuläret i stället.
        if (data === null && !listMode) {
          navigate('/profil/intervju', { replace: true })
          return
        }
        setProfile(data)
        setMunicipalities(list)
        setMyInterests(mine)
        setAccount(me)
        // Ingen profil än (listläget) → visa formuläret direkt, med det man redan
        // fyllt i om man lämnat sidan innan profilen sparades (se profileDraft.js).
        if (data === null) {
          const draft = loadProfileDraft(me.id)
          if (draft) {
            setName(draft.name ?? '')
            setBirthDate(draft.birthDate ?? '')
            setGender(draft.gender ?? '')
            setGenderSearchable(draft.genderSearchable ?? false)
            setMunicipalityCode(draft.municipalityCode ?? '')
            setDistrict(draft.district ?? '')
            setAboutText(draft.aboutText ?? '')
            setDraftInterests(draft.interests ?? [])
          }
        }
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

  // "Skapa din profil": spara utkastet medan man fyller i, så att inget går
  // förlorat om man råkar lämna sidan eller laddar om den. Bilden kan inte
  // sparas så, den väljer man igen.
  const creating = status === 'ready' && profile === null && account !== null
  useEffect(() => {
    if (!creating) return
    saveProfileDraft(account.id, {
      name,
      birthDate,
      gender,
      genderSearchable,
      municipalityCode,
      district,
      aboutText,
      interests: draftInterests,
    })
  }, [creating, account, name, birthDate, gender, genderSearchable, municipalityCode, district, aboutText, draftInterests])

  function startEditing() {
    setName(profile?.name ?? '')
    setBirthDate(profile?.birth_date ?? '')
    setGender(profile?.gender ?? '')
    setGenderSearchable(profile?.gender_searchable ?? false)
    setMunicipalityCode(profile?.municipality_code ?? '')
    setDistrict(profile?.district ?? '')
    setAboutText(profile?.profile_text ?? '')
    setUsername(account?.username ?? '')
    setEmail(account?.email ?? '')
    setAccountPassword('')
    setAvailability({ username: null, email: null })
    setFormError('')
    setEditing(true)
  }

  // Ändrade kontouppgifter (bara för en befintlig profil). Bara det som
  // ändrats skickas och kontrolleras.
  const accountChanges = {}
  if (profile && account && editing) {
    if (username !== account.username) accountChanges.username = username
    if (email !== (account.email ?? '')) accountChanges.email = email
  }
  const accountChanged = Object.keys(accountChanges).length > 0

  // Säger till direkt om ett nytt användarnamn eller en ny e-post redan används
  // av någon annan, en kort stund efter senaste tangenttrycket. Svar på en äldre
  // kontroll (som man hunnit skriva vidare på) kastas.
  const changedUsername = accountChanges.username ?? ''
  const changedEmail = accountChanges.email ?? ''
  useEffect(() => {
    const request = ++availabilityRequest.current
    if (!changedUsername.trim() && !changedEmail.trim()) {
      setAvailability({ username: null, email: null })
      return undefined
    }
    const timer = setTimeout(() => {
      checkAvailability({ username: changedUsername, email: changedEmail })
        .then((result) => request === availabilityRequest.current && setAvailability(result))
        // Kontrollen är bara en hjälp: misslyckas den säger Spara till i stället.
        .catch(() => {})
    }, AVAILABILITY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [changedUsername, changedEmail])

  const byName = (a, b) => a.name.localeCompare(b.name, 'sv')

  // "Vad gillar du?" på profilen sparar direkt. Backend svarar med den
  // uppdaterade listan, och stoppar att det sista intresset tas bort.
  async function addSavedInterest(interest) {
    setMyInterests(await addInterest(interest.id))
  }

  // Frågar först. Underintressen till det man tar bort ligger kvar, och visas
  // överst i stället.
  async function removeSavedInterest(interest) {
    if (!window.confirm(`Vill du ta bort ${interest.name} från din profil?`)) return
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

    // 0. Kontouppgifterna, om de ändrats. De sparas först, så att fel lösenord
    //    eller ett upptaget namn (de vanligaste felen) stoppar allt innan
    //    profilen ändras. Misslyckas profilen efteråt är kontouppgifterna ändå
    //    sparade; de visas då som sparade, och felet för profilen visas.
    if (accountChanged) {
      try {
        const me = await updateAccount({ password: accountPassword, ...accountChanges })
        setAccount(me)
        // Namnet uppe i menyn hämtas från inloggningen, så den uppdateras också.
        updateUser(me)
      } catch (err) {
        setFormError(err.message)
        setSaving(false)
        return
      }
    }

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
        saved = await uploadResizedImage(pendingImage)
      } catch (err) {
        setImageNotice(`Profilen sparades, men bilden kunde inte laddas upp: ${err.message}`)
      }
      setPendingImage(null)
    }
    setProfile(saved)

    // 3. En ny profil sparade intressena i steg 1. Nu är profilen klar, så
    //    resten av appen låses upp (se RequireProfile).
    if (isNew) {
      setMyInterests([...draftInterests].sort(byName))
      clearProfileDraft(account.id)
      updateUser({ ...user, profile_completed: true })
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

          {/* Kontouppgifterna. En ny profil har redan valt dem när kontot skapades. */}
          {!isNew && (
            <>
              <h2>Kontouppgifter</h2>
              <label htmlFor="profile-username">Användarnamn</label>
              <input
                id="profile-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={50}
                required
              />
              {availability.username && <p className="form-error">{availability.username}</p>}

              <label htmlFor="profile-email">E-postadress</label>
              <input
                id="profile-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {availability.email && <p className="form-error">{availability.email}</p>}
              <p className="hint-text">E-posten syns bara för dig.</p>

              {/* Lösenordet krävs bara när användarnamn eller e-post ändras. */}
              {accountChanged && (
                <>
                  <label htmlFor="profile-account-password">
                    Skriv ditt lösenord för att spara nytt användarnamn eller ny e-post
                  </label>
                  <input
                    id="profile-account-password"
                    type="password"
                    autoComplete="current-password"
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    required
                  />
                </>
              )}
            </>
          )}

          {formError && <p className="form-error">{formError}</p>}

          <button type="submit" disabled={saving || Boolean(availability.username || availability.email)}>
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
        <dt>Användarnamn</dt>
        <dd>{account?.username ?? '–'}</dd>
        <dt>E-post</dt>
        <dd>{account?.email ?? 'Ingen e-post sparad'}</dd>
      </dl>
      <p className="hint-text">E-posten syns bara för dig.</p>
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
