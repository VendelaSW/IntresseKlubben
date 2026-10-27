import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import InterestTags from '../InterestTags'
import Modal from '../Modal'
import TextareaWithCount from '../TextareaWithCount'
import ShowOnMapButton from '../ShowOnMapButton'
import InvitePicker from './InvitePicker'
import { eventExtrasText, eventWhenWhereText, VisibilityStamp } from './EventList'
import GroupJoinRequests from '../groups/GroupJoinRequests'
import {
  EVENT_ANSWER,
  answerEvent,
  applyToEvent,
  approveEventRequest,
  declineEventRequest,
  deleteEvent,
  getEventRequests,
  getEventResponses,
  inviteToEvent,
  setEventHost,
  updateEvent,
  withdrawEventApplication,
} from '../../services/events'
import { skillLevelLabel } from '../../services/groups'
import LoadError, { useRetry } from '../LoadError'

const ANSWERS = [
  { id: EVENT_ANSWER.yes, label: 'Ja' },
  { id: EVENT_ANSWER.maybe, label: 'Kanske' },
  { id: EVENT_ANSWER.no, label: 'Nej' },
]

// Eventets egen vy: information, ens eget svar (Ja, Kanske eller Nej) och vilka
// som har svarat, i liten text. Namnen är länkar till personens profil. Den man
// själv har blockerat visas med märket "Blockerad". `onAnswered` får
// föräldern att hämta om eventlistorna, så att ens svar och flikarna stämmer.
// "Bjud in" syns för den som får bjuda in (event.can_invite: skaparen, eller alla
// om skaparen har slagit på "Gäster får bjuda in") och öppnar en popup med ens
// kompisar och klubbar (`contacts`, `groups`). Skaparen kan slå på och av valet här.
// Skaparen ser också Redigera (`onEdit`, formuläret visas av EventsPanel) och Radera,
// som öppnar en ruta där man kan skriva ett meddelande till dem som har svarat Ja
// eller Kanske (de får en notis från Intresseklubben), och sedan anropar
// `onDeleted`. Andra ser inte knapparna (och backend låter bara skaparen ändra och radera).
// Tillbaka-knappen ligger ovanför rutan, i EventsPanel.
//
// SCRUM-293, 295 och 296: nivån, området och "3 av 10 kommer" visas under titeln, och
// ett fullt event tar inte emot fler Ja. På ett event man ansöker till ansöker man
// (med ett valfritt meddelande) i stället för att svara, tills skaparen eller en
// medarrangör har godkänt. Medarrangörer (event.is_host) får redigera, bjuda in och
// svara på ansökningar, men bara skaparen raderar och väljer medarrangörer.
function EventDetails({ event, myInterestIds, contacts, groups, onAnswered, onEdit, onDeleted }) {
  const [responses, setResponses] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
  const [responsesAttempt, retryResponses] = useRetry()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [settingBusy, setSettingBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // Rutan "Ställ in eventet", med skaparens valfria meddelande till deltagarna.
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelMessage, setCancelMessage] = useState('')
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyMessage, setApplyMessage] = useState('')
  const skillLevel = skillLevelLabel(event.skill_level)
  const extras = eventExtrasText(event)

  useEffect(() => {
    setResponses(null)
    setFailed(false)
    getEventResponses(event.id)
      .then(setResponses)
      .catch(() => setFailed(true))
  }, [event.id, responsesAttempt])

  async function handleAnswer(answer) {
    setBusy(true)
    setError('')
    try {
      setResponses(await answerEvent(event.id, answer))
      await onAnswered()
    } catch (err) {
      setError(err.message)
      // Eventet har raderats (eller går inte längre att se): hämta om listan, så
      // att vyn byts mot förklaringen i EventsPanel.
      if (err.status === 404) await onAnswered()
    } finally {
      setBusy(false)
    }
  }

  // Ansök, eller ta tillbaka ansökan (SCRUM-296).
  async function handleApply(submitEvent) {
    submitEvent?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await applyToEvent(event.id, applyMessage)
      setApplyOpen(false)
      setApplyMessage('')
      await onAnswered()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw() {
    setBusy(true)
    setError('')
    try {
      await withdrawEventApplication(event.id)
      await onAnswered()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Skaparen gör någon till medarrangör eller tar tillbaka det.
  async function handleHost(userId, host) {
    setError('')
    try {
      await setEventHost(event.id, userId, host)
      await onAnswered()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleInvite(selection) {
    setInviteBusy(true)
    setInviteError('')
    try {
      const invited = await inviteToEvent(event.id, selection)
      setInviteOpen(false)
      setInviteNotice(
        invited.length === 0
          ? 'Alla var redan inbjudna.'
          : `Bjöd in ${invited.length} ${invited.length === 1 ? 'person' : 'personer'}.`,
      )
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleGuestsCanInvite(value) {
    setSettingBusy(true)
    setError('')
    try {
      await updateEvent(event.id, { guests_can_invite: value })
      await onAnswered()
    } catch (err) {
      setError(err.message)
    } finally {
      setSettingBusy(false)
    }
  }

  // De som har svarat Ja eller Kanske (utom skaparen) får en notis när eventet
  // ställs in, med skaparens meddelande om det finns ett.
  const coming = (responses ?? []).filter(
    (r) => r.id !== event.creator_id && (r.answer === EVENT_ANSWER.yes || r.answer === EVENT_ANSWER.maybe),
  ).length

  async function handleDelete(submitEvent) {
    submitEvent.preventDefault()
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteEvent(event.id, cancelMessage)
      setCancelOpen(false)
      onDeleted()
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  const creatorName = event.creator_name ?? event.creator_username

  return (
    <section className="detail-view">
      {/* Eventet till vänster, och det man gör med det (intresset, svaret, vilka som kommer) till höger,
          så att det får plats utan att scrolla när blocket är brett. Under varandra när det är smalt. */}
      <div className="detail-main">
        <div className="title-row">
          <p className="card-title">{event.title}</p>
          <VisibilityStamp event={event} />
        </div>
        <p className="card-subheading">{eventWhenWhereText(event)}</p>
        {extras && <p className="hint-text">{extras}</p>}
        {(skillLevel || event.is_full) && (
          <div className="card-actions">
            {skillLevel && <span className="status-pill">Nivå: {skillLevel}</span>}
            {event.is_full && <span className="status-pill">Fullt</span>}
          </div>
        )}
        <p className="hint-text">{event.address}</p>
        <ShowOnMapButton type="event" id={event.id} data={event} />
        <p className="card-text">{event.description}</p>
        <p className="hint-text">
          Skapat av{' '}
          <Link to={`/anvandare/${event.creator_id}`} className="info-link">
            {creatorName}
          </Link>
          {event.group_name && (
            <>
              {' i '}
              {/* Klubbens namn går till klubben, där man kan gå med. En privat klubb man inte är
                  med eller inbjuden i går inte att öppna, så då är det bara text. */}
              {event.group_visible ? (
                <Link to={`/klubbar?klubb=${event.group_id}`} className="info-link">
                  {event.group_name}
                </Link>
              ) : (
                event.group_name
              )}
            </>
          )}
        </p>

        {event.is_host && (
          <>
            <label>
              <input
                type="checkbox"
                checked={event.guests_can_invite}
                disabled={settingBusy}
                onChange={(e) => handleGuestsCanInvite(e.target.checked)}
              />{' '}
              Gäster får bjuda in
            </label>
            <div className="card-actions">
              <button type="button" className="secondary-button button-small" onClick={onEdit} disabled={deleting}>
                Redigera
              </button>
              {event.is_owner && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDeleteError('')
                    setCancelOpen(true)
                  }}
                >
                  Radera
                </button>
              )}
            </div>
            {cancelOpen && (
              <Modal title="Radera eventet" onClose={() => setCancelOpen(false)} locked={deleting}>
                <form className="auth-form form-compact" onSubmit={handleDelete}>
                  <p className="card-text">
                    «{event.title}» tas bort, med inbjudningar och svar. Det går inte att ångra.
                  </p>
                  {/* Medan svaren laddas sägs inget om vilka som får en notis. Gick de inte att hämta vet vi
                      inte, men backend skickar notiserna ändå, så meddelandefältet visas. */}
                  {responses === null && !failed && <p className="hint-text">Hämtar vilka som har svarat...</p>}
                  {failed && (
                    <p className="hint-text">
                      Kunde inte hämta vilka som har svarat. De som har svarat Ja eller Kanske får ändå en notis från
                      Intresseklubben om att eventet är inställt.
                    </p>
                  )}
                  {responses !== null && coming > 0 && (
                    <p className="hint-text">
                      {coming === 1 ? '1 person har' : `${coming} personer har`} svarat Ja eller Kanske och får en notis
                      från Intresseklubben om att eventet är inställt.
                    </p>
                  )}
                  {responses !== null && coming === 0 && (
                    <p className="hint-text">Ingen har svarat Ja eller Kanske, så ingen får någon notis.</p>
                  )}
                  {(failed || coming > 0) && (
                    <>
                      <label htmlFor={`cancel-message-${event.id}`}>Meddelande till dem (valfritt)</label>
                      <TextareaWithCount
                        id={`cancel-message-${event.id}`}
                        value={cancelMessage}
                        onChange={(e) => setCancelMessage(e.target.value)}
                        maxLength={300}
                        rows={3}
                        placeholder="T.ex. Inställt pga sjukdom, vi ses nästa vecka!"
                      />
                    </>
                  )}
                  {deleteError && <p className="status-error">{deleteError}</p>}
                  {/* Det säkra valet är den gula knappen, raderingen har en egen röd stil (.button-danger). */}
                  <div className="form-actions">
                    <button type="button" onClick={() => setCancelOpen(false)} disabled={deleting}>
                      Behåll eventet
                    </button>
                    <button type="submit" className="button-danger" disabled={deleting || (responses === null && !failed)}>
                      {deleting ? 'Raderar...' : 'Radera eventet'}
                    </button>
                  </div>
                </form>
              </Modal>
            )}
          </>
        )}
      </div>

      <div className="detail-aside">
        <div className="detail-view-section">
          <InterestTags
            interests={[{ id: event.interest_id, name: event.interest_name, area: event.interest_area }]}
            highlight={myInterestIds}
          />
        </div>

        <div className="detail-view-section">
          <section className="soft-box soft-box-wide">
            <h2>Kommer du?</h2>
            {event.can_answer ? (
              <>
                <ul className="tags">
                  {ANSWERS.map(({ id, label }) => (
                    <li key={id}>
                      <button
                        type="button"
                        className={`tag${event.my_answer === id ? ' tag-selected' : ''}`}
                        // Ett fullt event tar inte emot fler Ja (men den som redan sagt Ja kan ändra sig).
                        disabled={busy || (id === EVENT_ANSWER.yes && event.is_full && event.my_answer !== id)}
                        onClick={() => handleAnswer(id)}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
                {event.is_full && event.my_answer !== EVENT_ANSWER.yes && (
                  <p className="hint-text">Eventet är fullt, men du kan svara Kanske.</p>
                )}
              </>
            ) : event.has_applied ? (
              <div className="card-actions">
                <span className="status-pill status-pill-success">Ansökan skickad</span>
                <button type="button" className="secondary-button button-small" disabled={busy} onClick={handleWithdraw}>
                  Ta tillbaka
                </button>
              </div>
            ) : (
              <>
                <p className="hint-text">Skaparen godkänner vem som får vara med.</p>
                <button type="button" className="primary-button" disabled={busy} onClick={() => setApplyOpen(true)}>
                  Ansök
                </button>
              </>
            )}
            {error && <p className="status-error">{error}</p>}
          </section>
          {applyOpen && (
            <Modal title={`Ansök till ${event.title}`} onClose={() => setApplyOpen(false)}>
              <form className="auth-form" onSubmit={handleApply}>
                <label htmlFor="event-apply-message">Meddelande till skaparen (valfritt)</label>
                <textarea
                  id="event-apply-message"
                  rows={3}
                  maxLength={200}
                  value={applyMessage}
                  onChange={(e) => setApplyMessage(e.target.value)}
                  placeholder="T.ex. varför du vill vara med"
                />
                <p className="hint-text">Skaparen får en notis och svarar på din ansökan.</p>
                {error && <p className="status-error">{error}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={busy}>
                    {busy ? 'Skickar...' : 'Skicka ansökan'}
                  </button>
                  <button type="button" className="button-secondary" onClick={() => setApplyOpen(false)}>
                    Avbryt
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </div>

        {event.can_invite && (
          <>
            <div className="card-actions">
              <button
                type="button"
                className="secondary-button button-small"
                onClick={() => {
                  setInviteError('')
                  setInviteNotice('')
                  setInviteOpen(true)
                }}
              >
                Bjud in
              </button>
              {inviteNotice && <span className="status-success">{inviteNotice}</span>}
            </div>
            {inviteOpen && (
              <Modal title="Bjud in" onClose={() => setInviteOpen(false)}>
                <InvitePicker
                  contacts={contacts}
                  groups={groups}
                  submitLabel="Bjud in"
                  busy={inviteBusy}
                  error={inviteError}
                  onSubmit={handleInvite}
                  onCancel={() => setInviteOpen(false)}
                />
              </Modal>
            )}
          </>
        )}

        {event.is_host && event.visibility === 'application' && (
          <GroupJoinRequests
            group={event}
            onChanged={onAnswered}
            load={getEventRequests}
            approve={approveEventRequest}
            decline={declineEventRequest}
          />
        )}

        <Attendees
          responses={responses}
          failed={failed}
          onRetry={retryResponses}
          event={event}
          onHost={event.is_owner ? handleHost : null}
        />
      </div>
    </section>
  )
}

// Vilka som har svarat, uppdelat på Ja, Kanske och Nej. Medarrangörerna har ett
// märke, och skaparen (`onHost`) kan göra någon till medarrangör eller ta tillbaka det.
function Attendees({ responses, failed, onRetry, event, onHost }) {
  if (failed) return <LoadError text="Kunde inte hämta svaren." onRetry={onRetry} className="hint-text" />
  if (responses === null) return <p className="hint-text">Laddar svar...</p>
  if (responses.length === 0) return <p className="hint-text">Ingen har svarat än.</p>

  return (
    <div className="person-list person-list-compact">
      {ANSWERS.map(({ id, label }) => {
        const people = responses.filter((r) => r.answer === id)
        if (people.length === 0) return null
        return (
          <div key={id}>
            <p className="hint-text">
              {label} ({people.length})
            </p>
            <ul>
              {people.map((p) => (
                <li key={p.id}>
                  <Link to={`/anvandare/${p.id}`} className="person-list-item">
                    <Avatar name={p.name ?? p.username} imageUrl={p.image_url} className="person-list-avatar" />
                    <span>{p.name ?? p.username}</span>
                    {p.id === event.creator_id && <span className="hint-text">Skapare</span>}
                    {event.host_ids.includes(p.id) && <span className="hint-text">Medarrangör</span>}
                    {p.blocked_by_me && <span className="status-pill">Blockerad</span>}
                  </Link>
                  {onHost && p.id !== event.creator_id && !p.blocked_by_me && (
                    <span className="group-member-actions">
                      <button type="button" className="text-button" onClick={() => onHost(p.id, !event.host_ids.includes(p.id))}>
                        {event.host_ids.includes(p.id) ? 'Ta bort som medarrangör' : 'Gör till medarrangör'}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export default EventDetails
