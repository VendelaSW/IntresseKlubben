import EmptyState from '../EmptyState'
import InterestTags from '../InterestTags'

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
  return <span className={`stamp${open ? ' stamp-success' : ''}`}>{open ? 'Öppet för alla' : 'Endast inbjudna'}</span>
}

// Ett kort per event, i samma rutnät som klubbkorten. Klick på kortet öppnar
// eventets egen vy. Märkena ligger utanför den klickbara delen (samma upplägg
// som GroupList). `myInterestIds` (en Set) markerar intresset om det är ett av
// ens egna.
function EventList({ events, emptyText, myInterestIds, onSelect }) {
  if (events.length === 0) return emptyText ? <EmptyState text={emptyText} /> : null

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
            interests={[{ id: event.interest_id, name: event.interest_name, area: event.interest_area, area_slug: event.interest_area_slug }]}
            highlight={myInterestIds}
          />
          <div className="card-actions">
            {event.is_owner && <span className="status-pill status-pill-owner">Skapare</span>}
            <VisibilityStamp event={event} />
          </div>
        </article>
      ))}
    </div>
  )
}

export default EventList
