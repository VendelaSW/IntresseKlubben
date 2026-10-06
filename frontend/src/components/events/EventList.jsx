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

// Ett kort per event, i samma rutnät som klubbkorten. Korten går inte att
// klicka på än (eventets egen vy kommer i ett eget steg), så de har ingen
// hover. `myInterestIds` (en Set) markerar intresset om det är ett av ens egna.
function EventList({ events, emptyText, myInterestIds }) {
  if (events.length === 0) return <p className="hint-text">{emptyText}</p>

  return (
    <div className="card-grid card-grid-compact">
      {events.map((event) => (
        <article key={event.id} className="card list-card">
          <div className="detail-view">
            <span className="card-title">{event.title}</span>
            <span className="card-subheading">
              {eventTimeText(event)} · {event.place_name}
            </span>
            <span className="card-text list-card-description">{event.description}</span>
          </div>
          <InterestTags
            interests={[{ id: event.interest_id, name: event.interest_name }]}
            highlight={myInterestIds}
          />
          <div className="card-actions">
            {event.is_owner && <span className="status-pill status-pill-owner">Skapare</span>}
            <span className="status-pill">{event.visibility === 'open' ? 'Öppet' : 'Endast inbjudna'}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

export default EventList
