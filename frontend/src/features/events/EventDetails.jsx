import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../shared/Avatar'
import InterestTags from '../interests/InterestTags'
import Modal from '../../shared/Modal'
import TextareaWithCount from '../../shared/TextareaWithCount'
import ShowOnMapButton from '../../map/ShowOnMapButton'
import DeleteEventDialog from './DeleteEventDialog'
import InvitePicker from './InvitePicker'
import { eventAreaText, eventCapacity, placeBoxClass, TicketDate, ticketTimeText, VisibilityStamp } from './EventList'
import GroupJoinRequests from '../clubs/GroupJoinRequests'
import {
  EVENT_ANSWER,
  answerEvent,
  removeAnswer,
  applyToEvent,
  approveEventRequest,
  declineEventRequest,
  getEventRequests,
  getEventResponses,
  inviteToEvent,
  setEventHost,
  updateEvent,
  withdrawEventApplication,
} from '../../services/events'
import { skillLevelLabel } from '../../services/groups'
import LoadError, { useRetry } from '../../shared/LoadError'
import InfoTip from '../../shared/InfoTip'
import IconButton from '../../shared/IconButton'

// `label` står på knapparna under "Kommer du?", `heading` över dem som har svarat så.
const ANSWERS = [
  { id: EVENT_ANSWER.yes, label: 'Ja', heading: 'Kommer' },
  { id: EVENT_ANSWER.maybe, label: 'Kanske', heading: 'Kanske' },
  { id: EVENT_ANSWER.no, label: 'Nej', heading: 'Kommer inte' },
]

// Eventets egen vy: information, ens eget svar (Ja, Kanske eller Nej) och vilka
// som har svarat, i liten text. Namnen är länkar till personens profil. Den man
// själv har blockerat visas med märket "Blockerad". `onAnswered` får
// föräldern att hämta om eventlistorna, så att ens svar och flikarna stämmer.
// "Bjud in" syns för den som får bjuda in (event.can_invite: skaparen, eller alla
// om skaparen har slagit på "Gäster får bjuda in") och öppnar en popup med ens
// kompisar och klubbar (`contacts`, `groups`). Skaparen kan slå på och av valet här.
// Skaparen och medarrangörerna ser också Redigera (`onEdit`, formuläret visas av EventsPanel). Radera finns i
// formuläret. Ägaren av eventets klubb, som får radera men inte redigera andras event (`event.can_delete`,
// SCRUM-326), ser Radera här, som öppnar DeleteEventDialog och sedan anropar `onDeleted`.
// Tillbaka-knappen ligger ovanför rutan, i EventsPanel.
//
// SCRUM-293, 295 och 296: nivån står under titeln, området under adressen, Fullt som stämpel vid titeln, och ett
// fullt event tar inte emot fler Ja. På ett event man ansöker till ansöker man
// (med ett valfritt meddelande) i stället för att svara, tills skaparen eller en
// medarrangör har godkänt. Medarrangörer (event.is_host) får redigera, bjuda in och
// svara på ansökningar, men bara skaparen raderar och väljer medarrangörer.
//
// Eventet ser ut som biljettkortet (Nicklas förslag, .event-ticket-sheet i index.css): titeln i tryckbokstäver,
// stämpeln (vem eventet är till för) uppe till höger, och datumet, tiden och platsen i ett kvitto längst ner.
// Adressen står under Om eventet.
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
  // Rutan "Radera eventet" (DeleteEventDialog), för klubbens ägare.
  const [cancelOpen, setCancelOpen] = useState(false)
  // Popupen med ansökningarna (för skaparen och medarrangörerna på ett event man ansöker till).
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyMessage, setApplyMessage] = useState('')
  const skillLevel = skillLevelLabel(event.skill_level)
  const area = eventAreaText(event)
  const capacity = eventCapacity(event)
  const full = capacity.spots === 'Fullt'
  // Skaparen tar ingen plats när hen inte räknas in i maxantalet, och kan då svara Ja även när det är fullt.
  const canSayYesWhenFull = event.is_owner && !event.creator_in_max

  useEffect(() => {
    setResponses(null)
    setFailed(false)
    getEventResponses(event.id)
      .then(setResponses)
      .catch(() => setFailed(true))
  }, [event.id, responsesAttempt])

  // Ett klick på det svar man redan har gett tar bort det (man har då inte svarat).
  async function handleAnswer(answer) {
    setBusy(true)
    setError('')
    try {
      setResponses(await (answer === event.my_answer ? removeAnswer(event.id) : answerEvent(event.id, answer)))
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
          : `Bjöd in ${invited.length} ${invited.length === 1 ? 'medlem' : 'medlemmar'}.`,
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
      {/* Eventet (med intresset) till vänster, och det man gör med det (svaret, vilka som kommer) till höger,
          så att det får plats utan att scrolla när blocket är brett. Under varandra när det är smalt. */}
      <div className="detail-main">
        {/* Titeln med stämplarna: ett fullt event har en röd Fullt-stämpel, så att man ser det direkt. Redigera
            (pennan) direkt till höger om titeln, för skaparen och medarrangörerna. */}
        <div className="title-row">
          <p className="card-title">{event.title}</p>
          {event.is_host && (
            <IconButton icon="edit" label="Redigera eventet" className="event-title-edit" onClick={onEdit} />
          )}
          <span className="event-stamps">
            {full && <span className="stamp stamp-full">Fullt</span>}
            <VisibilityStamp event={event} />
          </span>
        </div>
        {/* Vad det är och för vem: intresset och nivån direkt under titeln. */}
        <div className="event-tags">
          <InterestTags
            interests={[{ id: event.interest_id, name: event.interest_name, area_slug: event.interest_area_slug }]}
            highlight={myInterestIds}
          />
          {skillLevel && <span className="status-pill">Nivå: {skillLevel}</span>}
        </div>
        {/* Beskrivningen har ett fast utrymme, så att adressen står på samma plats. */}
        <div className="event-section">
          <h3 className="card-subheading">Om eventet</h3>
          <p className="card-text event-description">{event.description}</p>
        </div>
        <EventAddress event={event} area={area} />
      </div>

      <div className="detail-aside">
        {cancelOpen && <DeleteEventDialog event={event} onClose={() => setCancelOpen(false)} onDeleted={onDeleted} />}
        <div className="detail-view-section">
          <section className="soft-box soft-box-wide">
            {/* Fullt: den som inte har svarat eller ansökt kan inte göra något, så knapparna döljs. Skaparen och
                medarrangörerna ser dem som vanligt, och den som har svarat kan ändra sig. */}
            {event.is_full && !event.is_host && !event.my_answer && !event.has_applied ? (
              <>
                <h2>Eventet är fullt</h2>
                <p className="hint-text">Alla platser är tagna.</p>
              </>
            ) : (
              <>
                {/* Fullt står som stämpel vid titeln. */}
                <div className="event-answer-head">
                  <h2>Kommer du?</h2>
                </div>
                {event.can_answer ? (
                  <>
                    <ul className="tags">
                      {ANSWERS.map(({ id, label }) => (
                        <li key={id}>
                          <button
                            type="button"
                            className={`tag${event.my_answer === id ? ' tag-selected' : ''}`}
                            aria-pressed={event.my_answer === id}
                            title={event.my_answer === id ? 'Klicka igen för att ta bort ditt svar' : undefined}
                            // Ett fullt event tar inte emot fler Ja (men den som redan sagt Ja kan ändra sig, och en skapare som
                            // inte räknas in i maxantalet kan alltid svara Ja).
                            disabled={busy || (id === EVENT_ANSWER.yes && event.is_full && event.my_answer !== id && !canSayYesWhenFull)}
                            onClick={() => handleAnswer(id)}
                          >
                            {label}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {event.is_full && event.my_answer !== EVENT_ANSWER.yes && !canSayYesWhenFull && (
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
                    <div className="with-info-tip">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy}
                        onClick={() => setApplyOpen(true)}
                      >
                        Ansök
                      </button>
                      <InfoTip text="Skaparen godkänner vem som får vara med." />
                    </div>
                  </>
                )}
              </>
            )}
            {error && <p className="status-error">{error}</p>}
          </section>
          {applyOpen && (
            <Modal title={`Ansök till ${event.title}`} onClose={() => setApplyOpen(false)}>
              <form className="auth-form" onSubmit={handleApply}>
                <div className="with-info-tip">
                  <label htmlFor="event-apply-message">Meddelande till skaparen (valfritt)</label>
                  <InfoTip text="Skaparen får en notis och svarar på din ansökan." />
                </div>
                <TextareaWithCount
                  id="event-apply-message"
                  rows={3}
                  maxLength={200}
                  value={applyMessage}
                  onChange={(e) => setApplyMessage(e.target.value)}
                  placeholder="T.ex. varför du vill vara med"
                />
                {error && <p className="status-error">{error}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={busy}>
                    {busy ? 'Skickar...' : 'Skicka ansökan'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setApplyOpen(false)}>
                    Avbryt
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </div>

        {/* Bjud in, och för skaparen och medarrangörerna (som alltid får bjuda in) valet om gästerna också får det. */}
        {event.can_invite && (
          <>
            <div className="card-actions event-invite-actions">
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
              {event.is_host && (
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

        {/* Ansökningarna som ett antal ("3 personer vill vara med"). Ett tryck öppnar en popup där man släpper in eller
            nekar var och en, med antalet platser kvar överst. */}
        {event.is_host && event.visibility === 'application' && event.request_count > 0 && (
          <div className="event-section">
            <h3 className="card-subheading">Ansökningar</h3>
            <button
              type="button"
              className="secondary-button button-small event-requests-button"
              onClick={() => setRequestsOpen(true)}
            >
              {event.request_count === 1 ? '1 person' : `${event.request_count} personer`} vill vara med
            </button>
          </div>
        )}
        {requestsOpen && (
          <Modal title="Vilka vill vara med?" onClose={() => setRequestsOpen(false)}>
            {capacity.spots && <p className="hint-text">{capacity.spots}.</p>}
            {event.request_count === 0 && <p className="hint-text">Inga ansökningar kvar att svara på.</p>}
            <GroupJoinRequests
              group={event}
              // En godkänd ansökan står direkt som Kommer: hämta om eventet (antalet) och vilka som har svarat.
              onChanged={() => {
                retryResponses()
                return onAnswered()
              }}
              load={getEventRequests}
              approve={approveEventRequest}
              decline={declineEventRequest}
              declinePlaceholder="T.ex. att eventet redan är fullt"
              full={event.is_full}
              fullText="Eventet är fullt. Neka, eller höj maxantalet under Redigera för att kunna godkänna fler."
            />
          </Modal>
        )}

        <Attendees
          responses={responses}
          failed={failed}
          onRetry={retryResponses}
          event={event}
          onHost={event.is_owner ? handleHost : null}
        />
        {/* Längst ner i högerspalten, till höger: Radera (soptunnan) för klubbens ägare (event.can_delete,
            SCRUM-326), som får radera men inte redigera andras event. Skaparen raderar i redigeringsläget. */}
        {event.can_delete && !event.is_host && (
          <div className="event-ticket-owner">
            <div className="card-actions event-host-actions">
              <IconButton icon="delete" label="Radera eventet" onClick={() => setCancelOpen(true)} />
            </div>
          </div>
        )}
      </div>

      {/* Kvittot: datumet, tiden och platsen, som längst ner på biljettkortet, med urtagen i kanterna (se
          .event-ticket-sheet). */}
      <div className="event-ticket-sheet-stub">
        <TicketDate start={new Date(event.starts_at)} />
        <span className="event-ticket-box">{ticketTimeText(event)}</span>
        {event.place_name && <span className={placeBoxClass(event)}>{event.place_name}</span>}
        {/* Skapat av längst ner till höger i kvittot, i den minsta texten. */}
        <p className="hint-text event-created-by">
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
      </div>
    </section>
  )
}

// Svaren i siffror (Kommer, Kanske, Kommer inte och, om några inbjudna inte har svarat, Har inte svarat), en ruta per
// svar. Vilka som har svarat vad syns först när man trycker på rutan, som en rad med profilbilder; trycker man igen
// stängs den. En ruta i taget är öppen, och en ruta med 0 går inte att trycka på. Medarrangörerna har en stjärna, och
// skaparen (`onHost`) kan göra någon till medarrangör eller ta tillbaka det med den.
function Attendees({ responses, failed, onRetry, event, onHost }) {
  const [open, setOpen] = useState(null) // svaret vars lista visas
  if (failed) return <LoadError text="Kunde inte hämta svaren." onRetry={onRetry} className="hint-text" />
  if (responses === null) return <p className="hint-text">Laddar svar...</p>

  const groups = ANSWERS.map((answer) => ({ ...answer, people: responses.filter((r) => r.answer === answer.id) }))
  const openGroup = groups.find((g) => g.id === open && g.people.length > 0)
  return (
    <div className="event-section">
      <h3 className="card-subheading">Deltagare</h3>
      <ul className="answer-summary" aria-label="Svar">
        {groups.map(({ id, heading, people }) => (
          <li key={id}>
            <button
              type="button"
              className={`answer-summary-box${openGroup?.id === id ? ' is-open' : ''}`}
              aria-expanded={openGroup?.id === id}
              aria-controls="attendee-faces"
              disabled={people.length === 0}
              onClick={() => setOpen(openGroup?.id === id ? null : id)}
            >
              <span className="answer-summary-count">{people.length}</span>
              <span className="answer-summary-label">{heading}</span>
            </button>
          </li>
        ))}
        {event.unanswered_count > 0 && (
          <li>
            <span className="answer-summary-box">
              <span className="answer-summary-count">{event.unanswered_count}</span>
              <span className="answer-summary-label">Har inte svarat</span>
            </span>
          </li>
        )}
      </ul>
      {/* En rad med profilbilderna; namnet (och skapare, medarrangör eller blockerad) visas när man pekar eller tabbar
          till en bild. En stjärna i hörnet är en medarrangör. Skaparen (`onHost`) har stjärnan som knapp på alla, och
          gör någon till medarrangör eller tar tillbaka det med den. */}
      {openGroup && (
        <ul id="attendee-faces" className="attendee-faces" aria-label={openGroup.heading}>
          {openGroup.people.map((p) => {
            const name = p.name ?? p.username
            const host = event.host_ids.includes(p.id)
            const creator = p.id === event.creator_id
            const label = [name, creator ? 'skapare' : host ? 'medarrangör' : null, p.blocked_by_me ? 'blockerad' : null]
              .filter(Boolean)
              .join(', ')
            return (
              <li key={p.id} className={`attendee-face${p.blocked_by_me ? ' is-blocked' : ''}`}>
                <Link to={`/anvandare/${p.id}`} className="attendee-face-link" aria-label={label} data-tooltip={label}>
                  <Avatar name={name} imageUrl={p.image_url} className="attendee-face-avatar" />
                </Link>
                {onHost && !creator && !p.blocked_by_me ? (
                  <button
                    type="button"
                    className={`attendee-face-badge attendee-host-toggle${host ? ' is-host' : ''}`}
                    aria-label={host ? `Ta bort ${name} som medarrangör` : `Gör ${name} till medarrangör`}
                    data-tooltip={host ? 'Ta bort som medarrangör' : 'Gör till medarrangör'}
                    onClick={() => onHost(p.id, !host)}
                  >
                    <StarIcon filled={host} />
                  </button>
                ) : (
                  (creator || host) && (
                    <span className={`attendee-face-badge${host ? ' is-host' : ''}`} aria-hidden="true">
                      {creator ? '♛' : <StarIcon filled />}
                    </span>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// En liten stjärna för medarrangör: ifylld för den som är det, en kontur på knappen för den som inte är det.
function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Adressen, området (`area`, om eventet gäller ett större) och "Visa på kartan" under Om eventet. Platsens namn står
// i kvittot längst ner.
function EventAddress({ event, area }) {
  return (
    <div className="event-section event-ticket-address">
      {event.address && (
        <>
          <h3 className="card-subheading">Adress</h3>
          <p className="card-text">{event.address}</p>
        </>
      )}
      {area && <p className="hint-text">Gäller {area === 'Hela Sverige' ? 'hela Sverige' : area}</p>}
      <ShowOnMapButton type="event" id={event.id} data={event} className="info-link" />
    </div>
  )
}

export default EventDetails
