import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import InterestTree, { PROFILE_MAX_SUBS, profileTree } from '../components/InterestTree'
import ProfileAbout from '../components/ProfileAbout'
import { eventTimeText } from '../components/events/EventList'
import { useAuth } from '../hooks/useAuth'
import { useCanGoBack } from '../hooks/useCanGoBack'
import {
  answerContactRequest,
  blockUser,
  cancelContactRequest,
  contactsQuery,
  removeContact,
  sendContactRequest,
  unblockUser,
} from '../services/contacts'
import { eventsQuery } from '../services/events'
import { getMyInterests } from '../services/interests'
import { getUserProfile } from '../services/profile'

// Vem man är i förhållande till personen man tittar på, hämtat från
// GET /contacts och matchat på id. contactId pekar på själva
// relations-raden (inte personen), behövs för att acceptera/avböja/ta
// bort/svara på just den.
// Kompisarna kommer ur det delade minnet (se services/queryClient.js), och
// åtgärderna (förfrågan, blockera...) säger själva till minnet, så relationen
// stämmer direkt efteråt.
function useRelation(userId) {
  const { data, refetch } = useQuery(contactsQuery)
  const relation = useMemo(() => {
    if (!data) return null
    const findIn = (list) => list.find((c) => c.user.id === userId)
    const friend = findIn(data.contacts)
    const outgoing = findIn(data.outgoing_requests)
    const incoming = findIn(data.incoming_requests)
    if (friend) return { type: 'friends', contactId: friend.id }
    if (outgoing) return { type: 'outgoing', contactId: outgoing.id }
    if (incoming) return { type: 'incoming', contactId: incoming.id }
    return { type: 'none' }
  }, [data, userId])

  return [relation, refetch]
}

// Kompisförfrågan/blockera-knapparna för en annan användares profil. Alla
// relationsknappar delar samma utseende (secondary-button), bara
// texten och vad de gör skiljer sig åt beroende på relation.type.
function RelationButtons({ userId, name, blocked, onBlockedChange }) {
  const [relation, refresh] = useRelation(userId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const displayName = name

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
    if (await run(() => blockUser(userId))) onBlockedChange(true)
  }

  function handleCancelRequest() {
    if (!window.confirm('Ångrar du denna kompisförfrågan?')) return
    run(() => cancelContactRequest(relation.contactId))
  }

  async function handleUnblock() {
    if (await run(() => unblockUser(userId))) onBlockedChange(false)
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
          onClick={() => run(() => sendContactRequest(userId))}
        >
          Skicka kompisförfrågan
        </button>
      )}
      {relation.type === 'outgoing' && (
        <button type="button" className="secondary-button" disabled={busy} onClick={handleCancelRequest}>
          Ångra kompisförfrågan
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
            Acceptera kompisförfrågan
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
          Ta bort kompis
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

// Kommande events som personen har skapat. Listan är alla events man själv får se
// (samma delade hämtning som Events och kartan, se services/events.js), så ett
// event bara för inbjudna eller för en klubb man inte är med i syns inte här
// heller. Ett klick öppnar eventet, och Tillbaka går hit igen.
function CreatedEvents({ userId, isMe }) {
  const { data: events, isError } = useQuery(eventsQuery)
  const created = (events ?? []).filter((event) => event.creator_id === userId)

  return (
    <section className="profile-events">
      <h2>{isMe ? 'Mina events' : 'Events hen ordnar'}</h2>
      {isError ? (
        <p className="hint-text">Kunde inte hämta events.</p>
      ) : events === undefined ? (
        <p className="hint-text">Laddar events...</p>
      ) : created.length === 0 ? (
        <p className="hint-text">Inga kommande events.</p>
      ) : (
        <div className="person-list person-list-compact person-list-marker">
          <ul>
            {created.map((event) => (
              <li key={event.id}>
                <Link to={`/events?event=${event.id}`} className="person-list-item">
                  <span>{event.title}</span>
                  <span className="hint-text">
                    {eventTimeText(event)} · {event.place_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// Visar en annan användares profil, skrivskyddat. Ingen redigering och
// ingen bilduppladdning här - det är bara ägaren som kan ändra sin profil.
function UserProfilePage() {
  // Id:t från adressen (/anvandare/:userId) är text, men id:n från API:t är tal.
  const userId = Number(useParams().userId)
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'not-found' | 'error'
  const [profile, setProfile] = useState(null)
  const [blocked, setBlocked] = useState(false)
  // Ens egna intressen, för att markera de gemensamma med gult (som på
  // personkorten). null tills de är hämtade - då visas alla som vanliga taggar.
  const [myInterestIds, setMyInterestIds] = useState(null)
  // Den egna profilen kan öppnas via adressen, men man ska inte kunna
  // skicka kompisförfrågan, meddelande eller blockera sig själv.
  const isMe = user?.id === userId

  useEffect(() => {
    setStatus('loading')
    setBlocked(false)
    getUserProfile(userId)
      .then((data) => {
        setProfile(data)
        setStatus(data === null ? 'not-found' : 'ready')
      })
      .catch(() => setStatus('error'))
  }, [userId])

  useEffect(() => {
    getMyInterests()
      .then((mine) => setMyInterestIds(new Set(mine.map((interest) => interest.id))))
      .catch(() => {})
  }, [])

  const initial = profile?.name?.trim()?.[0]?.toUpperCase() ?? '?'

  // Går tillbaka dit man kom ifrån. Om sidan öppnades direkt (t.ex. en
  // delad länk) finns ingen tidigare sida i appen att gå tillbaka till,
  // och då skulle navigate(-1) ta en ut ur appen - gå till personlistan
  // i stället (se useCanGoBack).
  function handleBack() {
    if (canGoBack()) {
      navigate(-1)
    } else {
      navigate('/personer')
    }
  }

  return (
    <div className="content-stack">
      {/* Ovanför kortet, som i Klubbar och Events. */}
      <BackButton onClick={handleBack} />
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
          <section className="profile-interests">
            <h2>Intressen</h2>
            {/* Som ett träd, som på Min profil. Gemensamma intressen gula; den egna profilen: alla gula. */}
            {profile.interests.length > 0 ? (
              <InterestTree
                proposals={profileTree(profile.interests)}
                align="start"
                maxSubs={PROFILE_MAX_SUBS}
                highlight={isMe ? undefined : new Set([...(myInterestIds ?? [])].map((id) => `id:${id}`))}
              />
            ) : (
              <p className="hint-text">Inga intressen valda än.</p>
            )}
          </section>
          <CreatedEvents userId={userId} isMe={isMe} />
          {!isMe && (
            <>
              {/* Tydligast: att man kan skriva till personen, även innan ni är
                  kompisar. Brevtråden visar tidigare brev och svarsraden. */}
              {!blocked && (
                <Link to={`/meddelanden/${userId}`} className="primary-button profile-write">
                  Skriv ett brev
                </Link>
              )}
              <RelationButtons
                userId={userId}
                name={profile.name}
                blocked={blocked}
                onBlockedChange={setBlocked}
              />
            </>
          )}
        </div>
      )}

    </div>
  )
}

export default UserProfilePage
