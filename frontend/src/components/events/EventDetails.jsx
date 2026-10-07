import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import InterestTags from '../InterestTags'
import Modal from '../Modal'
import InvitePicker from './InvitePicker'
import { eventTimeText, visibilityPillClass, visibilityText } from './EventList'
import { EVENT_ANSWER, answerEvent, getEventResponses, inviteToEvent, updateEvent } from '../../services/events'

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
// kontakter och klubbar (`contacts`, `groups`). Skaparen kan slå på och av valet här.
function EventDetails({ event, myInterestIds, contacts, groups, onBack, onAnswered }) {
  const [responses, setResponses] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [settingBusy, setSettingBusy] = useState(false)

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

  const creatorName = event.creator_name ?? event.creator_username

  return (
    <section className="detail-view">
      <button type="button" className="secondary-button button-small" onClick={onBack}>
        ← Tillbaka
      </button>
      <div className="title-row">
        <p className="card-title">{event.title}</p>
        <span className={visibilityPillClass(event)}>{visibilityText(event)}</span>
      </div>
      <p className="card-subheading">
        {eventTimeText(event)} · {event.place_name}
      </p>
      <p className="hint-text">{event.address}</p>
      <p className="card-text">{event.description}</p>
      <div className="detail-view-section">
        <InterestTags
          interests={[{ id: event.interest_id, name: event.interest_name }]}
          highlight={myInterestIds}
        />
      </div>
      <p className="hint-text">
        Skapat av{' '}
        <Link to={`/anvandare/${encodeURIComponent(event.creator_username)}`} className="info-link">
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
        <label>
          <input
            type="checkbox"
            checked={event.guests_can_invite}
            disabled={settingBusy}
            onChange={(e) => handleGuestsCanInvite(e.target.checked)}
          />{' '}
          Gäster får bjuda in
        </label>
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
                <li key={p.username}>
                  <Link to={`/anvandare/${encodeURIComponent(p.username)}`} className="person-list-item">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="person-list-avatar" />
                    ) : (
                      <span className="person-list-avatar card-avatar-initials" aria-hidden="true">
                        {(p.name ?? p.username).trim()[0]?.toUpperCase()}
                      </span>
                    )}
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
