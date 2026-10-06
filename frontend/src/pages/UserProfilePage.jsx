import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ProfileAbout from '../components/ProfileAbout'
import { useAuth } from '../hooks/useAuth'
import {
  answerContactRequest,
  blockUser,
  cancelContactRequest,
  getContacts,
  removeContact,
  sendContactRequest,
  unblockUser,
} from '../services/contacts'
import { sendMessage } from '../services/messages'
import { getUserProfile } from '../services/profile'

// Skickar ett meddelande till personen man tittar på. Visar bara
// formuläret, själva konversationen läses på en egen sida senare.
function MessageForm({ username }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await sendMessage(username, text)
      setText('')
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label htmlFor="message-text">Skicka ett brev</label>
      <input
        id="message-text"
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSent(false)
        }}
        required
      />
      {error && <p className="form-error">{error}</p>}
      {sent && <p className="form-success">Skickat!</p>}
      <button type="submit" disabled={sending}>
        {sending ? 'Skickar...' : 'Skicka'}
      </button>
    </form>
  )
}

// Vem man är i förhållande till personen man tittar på, hämtat från
// GET /contacts och matchat på username. contactId pekar på själva
// relations-raden (inte personen), behövs för att acceptera/avböja/ta
// bort/svara på just den.
function useRelation(username) {
  const [relation, setRelation] = useState(null)

  function refresh() {
    getContacts().then((data) => {
      const findIn = (list) => list.find((c) => c.user.username === username)
      const friend = findIn(data.contacts)
      const outgoing = findIn(data.outgoing_requests)
      const incoming = findIn(data.incoming_requests)
      if (friend) setRelation({ type: 'friends', contactId: friend.id })
      else if (outgoing) setRelation({ type: 'outgoing', contactId: outgoing.id })
      else if (incoming) setRelation({ type: 'incoming', contactId: incoming.id })
      else setRelation({ type: 'none' })
    })
  }

  useEffect(refresh, [username])

  return [relation, refresh]
}

// Vänförfrågan/blockera-knapparna för en annan användares profil. Alla
// relationsknappar delar samma utseende (secondary-button), bara
// texten och vad de gör skiljer sig åt beroende på relation.type.
function RelationButtons({ username, name, blocked, onBlockedChange }) {
  const [relation, refresh] = useRelation(username)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const displayName = name ?? username

  // Returnerar true om åtgärden lyckades, så att anroparen kan reagera.
  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      refresh()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleBlock() {
    const question = `Blockera ${displayName}? Ni kan inte längre kontakta varandra. Du kan avblockera senare.`
    if (!window.confirm(question)) return
    if (await run(() => blockUser(username))) onBlockedChange(true)
  }

  function handleCancelRequest() {
    if (!window.confirm('Ångrar du denna förfrågan?')) return
    run(() => cancelContactRequest(relation.contactId))
  }

  async function handleUnblock() {
    if (await run(() => unblockUser(username))) onBlockedChange(false)
  }

  // Blockeringar syns inte i GET /contacts, så "blockerad" hålls här på
  // sidan direkt efter att man själv har blockerat. Laddar man om sidan är
  // profilen dold (en blockerad person syns ingenstans), och då avblockerar
  // man från listan "Blockerade användare" på sin egen profilsida.
  if (blocked) {
    return (
      <>
        <p className="hint-text">Du har blockerat {displayName}.</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={handleUnblock}>
          Avblockera
        </button>
        {error && <p className="form-error">{error}</p>}
      </>
    )
  }

  if (relation === null) return null

  return (
    <>
      {relation.type === 'none' && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => run(() => sendContactRequest(username))}
        >
          Skicka vänförfrågan
        </button>
      )}
      {relation.type === 'outgoing' && (
        <button type="button" className="secondary-button" disabled={busy} onClick={handleCancelRequest}>
          Ångra förfrågan
        </button>
      )}
      {relation.type === 'incoming' && (
        <>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => run(() => answerContactRequest(relation.contactId, 'accept'))}
          >
            Acceptera vänförfrågan
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => run(() => answerContactRequest(relation.contactId, 'reject'))}
          >
            Avböj
          </button>
        </>
      )}
      {relation.type === 'friends' && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => run(() => removeContact(relation.contactId))}
        >
          Ta bort vän
        </button>
      )}
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={handleBlock}
      >
        Blockera
      </button>
      {error && <p className="form-error">{error}</p>}
    </>
  )
}

// Visar en annan användares profil, skrivskyddat. Ingen redigering och
// ingen bilduppladdning här - det är bara ägaren som kan ändra sin profil.
function UserProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'not-found' | 'error'
  const [profile, setProfile] = useState(null)
  const [blocked, setBlocked] = useState(false)
  // Den egna profilen kan öppnas via adressen, men man ska inte kunna
  // skicka vänförfrågan, meddelande eller blockera sig själv.
  const isMe = user?.username === username

  useEffect(() => {
    setStatus('loading')
    setBlocked(false)
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
        <div className="card card-wide content-stack">
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
          <ProfileAbout text={profile.profile_text} />
          {!isMe && (
            <>
              <RelationButtons
                username={username}
                name={profile.name}
                blocked={blocked}
                onBlockedChange={setBlocked}
              />
              {!blocked && <MessageForm username={username} />}
            </>
          )}
        </div>
      )}

      <button type="button" className="text-button" onClick={handleBack}>
        ← Tillbaka
      </button>
    </div>
  )
}

export default UserProfilePage
