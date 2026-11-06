import { areaColors } from '../../utils/interestColors'
import EmptyState from '../../shared/EmptyState'
import InterestTags from '../interests/InterestTags'

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

// Hur många som kommer (har svarat Ja) och, med max antal, hur många platser som är kvar (SCRUM-293): { coming:
// "1 kommer", spots: "5 platser kvar", "1 plats kvar" eller "Fullt" }. `spots` är null utan max antal. Platserna
// räknas i backend (spots_left), eftersom skaparens Ja bara tar en plats när skaparen har valt det.
export function eventCapacity(event) {
  const coming = `${event.yes_count} kommer`
  if (!event.max_attendees) return { coming, spots: null }
  const left = event.spots_left ?? Math.max(0, event.max_attendees - event.yes_count)
  if (event.is_full || left === 0) return { coming, spots: 'Fullt' }
  return { coming, spots: `${left} ${left === 1 ? 'plats' : 'platser'} kvar` }
}

// Området, om eventet gäller ett större (SCRUM-295).
export function eventAreaText(event) {
  return event.scope === 'country' ? 'Hela Sverige' : event.scope_name
}

// En rad med området och, med max antal, "1 kommer, 5 platser kvar" (t.ex. på startsidan).
export function eventExtrasText(event) {
  const { coming, spots } = eventCapacity(event)
  const capacity = spots ? `${coming}, ${spots.toLowerCase()}` : null
  return [eventAreaText(event), capacity].filter(Boolean).join(' · ')
}

const dayFormat = new Intl.DateTimeFormat('sv-SE', { day: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('sv-SE', { month: 'short' })
const weekdayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'short' })

// Biljettens datum, stort och lite snett ("7" över "NOV"), på kortet och i eventets egen vy (EventDetails).
export function TicketDate({ start }) {
  return (
    <span className="event-ticket-date">
      <span className="event-ticket-day">{dayFormat.format(start)}</span>
      <span className="event-ticket-month">{monthFormat.format(start).replace('.', '')}</span>
    </span>
  )
}

// Biljettens tid: "lör 17:00", och "lör 17:00 – 19:00" med en sluttid.
export function ticketTimeText(event) {
  const start = new Date(event.starts_at)
  const end = event.ends_at && ` – ${timeFormat.format(new Date(event.ends_at))}`
  return `${weekdayFormat.format(start).replace('.', '')} ${timeFormat.format(start)}${end || ''}`
}

// Platsens svarta ruta i eventets kvitto: ett långt namn får mindre text, så att det ryms på kvittots två rader (se
// .event-ticket-box.is-long i index.css).
export function placeBoxClass(event) {
  return `event-ticket-box${event.place_name.length > 24 ? ' is-long' : ''}`
}

// Biljettens färger efter eventets intresse: raden överst (--poster) och kvittot (--poster-soft).
export function ticketColors(event) {
  const colors = areaColors(event.interest_area_slug)
  return { '--poster': colors['--tag-fill'], '--poster-soft': colors['--tag-sub'] }
}

// Ett event som en biljett för att komma in, i pappersstilen som klubbkorten (Nicklas förslag): ett stående kort med
// titeln och beskrivningen överst och ett avrivbart kvitto längst ner, avdelat med en perforerad linje och två urtag i
// kanterna: datumet stort, klockslaget och platsen. Raden överst är i intressets färg, som på klubbkorten. Klick på
// kortet öppnar eventets egen vy. Märkena ligger utanför den klickbara delen (samma upplägg som GroupList).
function EventTicket({ event, myInterestIds, onSelect }) {
  const start = new Date(event.starts_at)
  return (
    <div className="event-ticket-wrap">
      <article className="card card-interactive list-card event-ticket" style={ticketColors(event)}>
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
          <TicketDate start={start} />
          <span className="event-ticket-when">
            {/* Med en sluttid ("lör 17:00 – 19:00") är tiden mindre, så att den inte täcker datumet. */}
            <strong className={event.ends_at ? 'is-range' : undefined}>{ticketTimeText(event)}</strong>
            {event.place_name && <span className="event-ticket-place">{event.place_name}</span>}
          </span>
        </div>
      </article>
    </div>
  )
}

// Ett kort (en biljett) per event, i samma rutnät som klubbkorten. `myInterestIds` (en Set) markerar intresset om det
// är ett av ens egna.
function EventList({ events, emptyText, myInterestIds, onSelect }) {
  if (events.length === 0) return emptyText ? <EmptyState text={emptyText} /> : null
  return (
    <div className="card-grid card-grid-compact">
      {events.map((event) => (
        <EventTicket key={event.id} event={event} myInterestIds={myInterestIds} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default EventList
