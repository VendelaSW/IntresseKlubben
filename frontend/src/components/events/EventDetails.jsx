import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import InterestTags from '../InterestTags'
import Modal from '../Modal'
import TextareaWithCount from '../TextareaWithCount'
import ShowOnMapButton from '../ShowOnMapButton'
import InvitePicker from './InvitePicker'
import { eventTimeText, visibilityPillClass, visibilityText } from './EventList'
import { EVENT_ANSWER, answerEvent, deleteEvent, getEventResponses, inviteToEvent, updateEvent } from '../../services/events'

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
function EventDetails({ event, myInterestIds, contacts, groups, onAnswered, onEdit, onDeleted }) {
  const [responses, setResponses] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
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

  useEffect(() => {
    setResponses(null)
    setFailed(false)
    getEventResponses(event.id)
      .then(setResponses)
      .catch(() => setFailed(true))
  }, [event.id])

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
      <div className="title-row">
        <p className="card-title">{event.title}</p>
        <span className={visibilityPillClass(event)}>{visibilityText(event)}</span>
      </div>
      <p className="card-subheading">
        {eventTimeText(event)} · {event.place_name}
      </p>
      <p className="hint-text">{event.address}</p>
      <ShowOnMapButton type="event" id={event.id} data={event} />
      <p className="card-text">{event.description}</p>
      <div className="detail-view-section">
        <InterestTags
          interests={[{ id: event.interest_id, name: event.interest_name, area: event.interest_area }]}
          highlight={myInterestIds}
        />
      </div>
      <p className="hint-text">
        Skapat av{' '}
        <Link to={`/anvandare/${event.creator_id}`} className="info-link">
          {creatorName}
        </Link>
        {event.group_name && ` i ${event.group_name}`}
      </p>

      <div className="detail-view-section">
        <section className="soft-box soft-box-wide">
          <h2>Kommer du?</h2>
          <ul className="tags">
            {ANSWERS.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  className={`tag${event.my_answer === id ? ' tag-selected' : ''}`}
                  disabled={busy}
                  onClick={() => handleAnswer(id)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="status-error">{error}</p>}
        </section>
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

      {event.is_owner && (
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
          </div>
          {cancelOpen && (
            <Modal title="Radera eventet" onClose={() => !deleting && setCancelOpen(false)}>
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

      <Attendees responses={responses} failed={failed} />
    </section>
  )
}

// Vilka som har svarat, uppdelat på Ja, Kanske och Nej.
function Attendees({ responses, failed }) {
  if (failed) return <p className="hint-text">Kunde inte hämta svaren.</p>
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
                    {p.blocked_by_me && <span className="status-pill">Blockerad</span>}
                  </Link>
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
