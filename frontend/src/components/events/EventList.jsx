import { useDesignChoice } from '../../hooks/useDesignChoice'
import { areaColors } from '../../utils/interestColors'
import EmptyState from '../EmptyState'
import InterestTags from '../InterestTags'
import './eventCardVariants.css'

const startFormat = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })

// "lör 10 okt 18:00", eller "lör 10 okt 18:00 – 20:00" när eventet har en
// sluttid samma dag, och med datum på sluttiden om det slutar en annan dag.
export function eventTimeText(event) {
  const start = new Date(event.starts_at)
  if (!event.ends_at) return startFormat.format(start)
  const end = new Date(event.ends_at)
  const sameDay = start.toDateString() === end.toDateString()
  return `${startFormat.format(start)} – ${sameDay ? timeFormat.format(end) : startFormat.format(end)}`
}

// När och var, t.ex. "lör 10 okt. 13:30 – 15:00, Slottsskogen".
export function eventWhenWhereText(event) {
  return [eventTimeText(event), event.place_name].filter(Boolean).join(', ')
}

// Vem eventet är till för, som en stämpel: grön för öppet, mörk för endast inbjudna.
export function VisibilityStamp({ event }) {
  const open = event.visibility === 'open'
  const label = open ? 'Öppet för alla' : event.visibility === 'application' ? 'Ansökan' : 'Endast inbjudna'
  return <span className={`stamp${open ? ' stamp-success' : ''}`}>{label}</span>
}

// "3 kommer", "3 av 10 kommer" eller "Fullt" (SCRUM-293), och området om eventet gäller ett större (SCRUM-295).
export function eventExtrasText(event) {
  const coming = event.max_attendees
    ? event.is_full
      ? 'Fullt'
      : `${event.yes_count} av ${event.max_attendees} kommer`
    : null
  const area = event.scope === 'country' ? 'Hela Sverige' : event.scope_name
  return [area, coming].filter(Boolean).join(' · ')
}

const dayFormat = new Intl.DateTimeFormat('sv-SE', { day: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('sv-SE', { month: 'short' })
const weekdayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'short' })

// TILLFÄLLIGT (testläget, väljaren "Eventkort"): eventet som en biljett för att komma in, i pappersstilen som klubbkorten. Ett
// stående kort med titeln och beskrivningen överst och ett avrivbart kvitto längst ner, avdelat med en perforerad linje och två urtag
// i kanterna: datumet stort, klockslaget och platsen. Raden överst är i intressets färg, som på klubbkorten.
// Se eventCardVariants.css. Exporterad för stilguiden.
export function EventTicket({ event, myInterestIds, onSelect }) {
  const start = new Date(event.starts_at)
  const colors = areaColors(event.interest_area_slug)
  return (
    <div className="event-ticket-wrap">
      <article
        className="card card-interactive list-card event-ticket"
        style={{ '--poster': colors['--tag-fill'], '--poster-soft': colors['--tag-sub'] }}
      >
        <div className="event-ticket-head" aria-hidden="true">
          Event
        </div>
        <button type="button" className="list-card-link event-ticket-main" onClick={() => onSelect(event)}>
          <span className="card-title">{event.title}</span>
          <span className="card-text list-card-description">{event.description}</span>
        </button>
        <InterestTags
          interests={[{ id: event.interest_id, name: event.interest_name, area_slug: event.interest_area_slug }]}
          highlight={myInterestIds}
        />
        <div className="card-actions">
          {event.is_owner && <span className="status-pill status-pill-owner">Skapare</span>}
          {!event.is_owner && event.is_host && <span className="status-pill status-pill-owner">Medarrangör</span>}
          {event.is_full && <span className="status-pill">Fullt</span>}
          <VisibilityStamp event={event} />
        </div>
        <div className="event-ticket-stub">
          <span className="event-ticket-date">
            <span className="event-ticket-day">{dayFormat.format(start)}</span>
            <span className="event-ticket-month">{monthFormat.format(start).replace('.', '')}</span>
          </span>
          <span className="event-ticket-when">
            <strong>
              {weekdayFormat.format(start).replace('.', '')} {timeFormat.format(start)}
              {event.ends_at && ` – ${timeFormat.format(new Date(event.ends_at))}`}
            </strong>
            {event.place_name && <span className="event-ticket-place">{event.place_name}</span>}
          </span>
        </div>
      </article>
    </div>
  )
}

// Ett kort per event, i samma rutnät som klubbkorten. Klick på kortet öppnar
// eventets egen vy. Märkena ligger utanför den klickbara delen (samma upplägg
// som GroupList). `myInterestIds` (en Set) markerar intresset om det är ett av
// ens egna.
function EventList({ events, emptyText, myInterestIds, onSelect }) {
  const cardStyle = useDesignChoice('eventCard')
  if (events.length === 0) return emptyText ? <EmptyState text={emptyText} /> : null

  if (cardStyle === 'biljett') {
    return (
      <div className="card-grid card-grid-compact">
        {events.map((event) => (
          <EventTicket key={event.id} event={event} myInterestIds={myInterestIds} onSelect={onSelect} />
        ))}
      </div>
    )
  }

  return (
    <div className="card-grid card-grid-compact">
      {events.map((event) => (
        <article key={event.id} className="card card-interactive list-card">
          <button type="button" className="list-card-link" onClick={() => onSelect(event)}>
            <span className="card-title">{event.title}</span>
            {/* Alltid två rader: tiden och platsen under, var och en kortad med "…" (se .list-card-meta). */}
            <span className="card-subheading list-card-meta">
              <span>{eventTimeText(event)}</span>
              <span>{event.place_name}</span>
            </span>
            <span className="card-text list-card-description">{event.description}</span>
          </button>
          <InterestTags
            interests={[{ id: event.interest_id, name: event.interest_name, area_slug: event.interest_area_slug }]}
            highlight={myInterestIds}
          />
          <div className="card-actions">
            {event.is_owner && <span className="status-pill status-pill-owner">Skapare</span>}
            {!event.is_owner && event.is_host && <span className="status-pill status-pill-owner">Medarrangör</span>}
            {event.is_full && <span className="status-pill">Fullt</span>}
            <VisibilityStamp event={event} />
          </div>
        </article>
      ))}
    </div>
  )
}

export default EventList
