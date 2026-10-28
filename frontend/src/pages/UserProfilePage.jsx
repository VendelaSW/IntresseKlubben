import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import InterestTree, { profileTree } from '../components/InterestTree'
import ProfileAbout from '../components/ProfileAbout'
import ProfileHeader, { profileFacts } from '../components/ProfileHeader'
import ReportButton from '../components/ReportButton'
import { eventWhenWhereText } from '../components/events/EventList'
import { groupMembersText } from '../components/groups/GroupList'
import { useAuth } from '../hooks/useAuth'
import { useCanGoBack } from '../hooks/useCanGoBack'
import {
  answerContactRequest,
  blockConfirm,
  blockUser,
  CANCEL_REQUEST,
  removeContactConfirm,
  cancelContactRequest,
  contactsQuery,
  removeContact,
  sendContactRequest,
  unblockUser,
} from '../services/contacts'
import { eventsQuery } from '../services/events'
import { memberGroupsQuery } from '../services/groups'
import { getMyInterests } from '../services/interests'
import { getUserProfile } from '../services/profile'
import { REPORT_TARGET } from '../services/reports'
import { useConfirm } from '../hooks/useConfirm'
import LoadError, { useRetry } from '../components/LoadError'

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
  const confirm = useConfirm()
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
    if (!(await confirm(blockConfirm(displayName)))) return
    if (await run(() => blockUser(userId))) onBlockedChange(true)
  }

  async function handleCancelRequest() {
    if (!(await confirm(CANCEL_REQUEST))) return
    run(() => cancelContactRequest(relation.contactId))
  }

  async function handleRemoveContact() {
    if (!(await confirm(removeContactConfirm(displayName)))) return
    run(() => removeContact(relation.contactId))
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
        <ReportButton targetType={REPORT_TARGET.profile} targetId={userId} userId={userId} name={displayName} />
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
          onClick={handleRemoveContact}
        >
          Ta bort kompis
        </button>
      )}
      {/* Blockera och Anmäl på en egen rad under knapparna, så att de inte trängs med dem. */}
      <div className="profile-actions-secondary">
        <button type="button" className="text-button" disabled={busy} onClick={handleBlock}>
          Blockera
        </button>
        <ReportButton
          targetType={REPORT_TARGET.profile}
          targetId={userId}
          userId={userId}
          name={displayName}
          onBlocked={() => onBlockedChange(true)}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
    </>
  )
}

// En lista med länkar på profilen (events och klubbar): rubrik, och en rad per
// sak med namn och en detalj under. `items` är [{ key, to, title, detail }],
// eller undefined medan listan laddas. Ett klick öppnar saken, och Tillbaka går
// hit igen.
function ProfileLinkList({ title, items, isError, errorText, onRetry, retrying, loadingText, emptyText }) {
  return (
    <section className="profile-events">
      <h2>{title}</h2>
      {isError ? (
        <LoadError text={errorText} onRetry={onRetry} retrying={retrying} className="hint-text" />
      ) : items === undefined ? (
        <p className="hint-text">{loadingText}</p>
      ) : items.length === 0 ? (
        <p className="hint-text">{emptyText}</p>
      ) : (
        <div className="person-list person-list-compact person-list-marker">
          <ul>
            {items.map((item) => (
              <li key={item.key}>
                <Link to={item.to} className="person-list-item">
                  <span>{item.title}</span>
                  <span className="hint-text">{item.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// Kommande events som personen har skapat. Listan är alla events man själv får se
// (samma delade hämtning som Events och kartan, se services/events.js), så ett
// event bara för inbjudna eller för en klubb man inte är med i syns inte här
// heller.
function CreatedEvents({ userId, isMe }) {
  const { data: events, isError, refetch, isFetching } = useQuery(eventsQuery)
  const created = events?.filter((event) => event.creator_id === userId)

  return (
    <ProfileLinkList
      title={isMe ? 'Mina events' : 'Events hen ordnar'}
      items={created?.map((event) => ({
        key: event.id,
        to: `/events?event=${event.id}`,
        title: event.title,
        detail: eventWhenWhereText(event),
      }))}
      isError={isError}
      errorText="Kunde inte hämta events."
      onRetry={() => refetch()}
      retrying={isFetching}
      loadingText="Laddar events..."
      emptyText="Inga kommande events."
    />
  )
}

// Klubbarna personen är med i, så att man hittar klubbar via folk man gillar.
// Servern visar bara öppna klubbar, och privata som man själv är med i (se
// GET /groups/member/{id}).
function MemberClubs({ userId, isMe }) {
  const { data: groups, isError, refetch, isFetching } = useQuery(memberGroupsQuery(userId))

  return (
    <ProfileLinkList
      title={isMe ? 'Mina klubbar' : 'Klubbar hen är med i'}
      items={groups?.map((group) => ({
        key: group.id,
        to: `/klubbar?klubb=${group.id}`,
        title: group.name,
        detail: groupMembersText(group),
      }))}
      isError={isError}
      errorText="Kunde inte hämta klubbar."
      onRetry={() => refetch()}
      retrying={isFetching}
      loadingText="Laddar klubbar..."
      emptyText={isMe ? 'Du är inte med i någon klubb än.' : 'Inga klubbar att visa.'}
    />
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
  const [attempt, retry] = useRetry()

  useEffect(() => {
    setStatus('loading')
    setBlocked(false)
    getUserProfile(userId)
      .then((data) => {
        setProfile(data)
        setStatus(data === null ? 'not-found' : 'ready')
      })
      .catch(() => setStatus('error'))
  }, [userId, attempt])

  useEffect(() => {
    getMyInterests()
      .then((mine) => setMyInterestIds(new Set(mine.map((interest) => interest.id))))
      .catch(() => {})
  }, [])

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
      {status === 'error' && <LoadError text="Kunde inte hämta profilen." onRetry={retry} className="form-error" />}

      {status === 'ready' && (
        <div className="card card-wide content-stack profile-card">
          {/* Överst bild, namn och det viktigaste på en rad (tomma uppgifter syns inte). */}
          <ProfileHeader
            name={profile.name ?? 'Profil'}
            imageUrl={profile.image_url}
            facts={profileFacts(profile)}
            heading="h1"
          />
          {/* Två spalter på dator, så att det mesta syns utan att scrolla: personen och knapparna till
              vänster, intressen, events och klubbar till höger. Under varandra på mobil. */}
          <div className="profile-columns">
            <div className="profile-column">
              <ProfileAbout text={profile.profile_text} />
              {!isMe && (
                <div className="profile-actions">
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
                </div>
              )}
            </div>
            <div className="profile-column">
              <section className="profile-interests">
                <h2>Intressen</h2>
                {/* Som på Min profil: underintressen bakom ▼, gemensamma intressen med en bock (inga på den egna). */}
                {profile.interests.length > 0 ? (
                  <InterestTree
                    proposals={profileTree(profile.interests)}
                    align="start"
                    highlight={isMe ? undefined : new Set([...(myInterestIds ?? [])].map((id) => `id:${id}`))}
                  />
                ) : (
                  <p className="hint-text">Inga intressen valda än.</p>
                )}
              </section>
              <CreatedEvents userId={userId} isMe={isMe} />
              <MemberClubs userId={userId} isMe={isMe} />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default UserProfilePage
