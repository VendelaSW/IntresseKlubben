import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventTimeText } from '../events/EventList'
import { getEvents } from '../../services/events'

// Klubbens kommande events i klubbens vy: titel, tid och plats, och ett klick
// öppnar eventets egen vy på eventsidan. Listan är alla events man får se som hör
// till klubben (passerade är redan dolda av backend), tidigast först.
function GroupEvents({ groupId }) {
  const [events, setEvents] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setEvents(null)
    setFailed(false)
    getEvents()
      .then((all) => setEvents(all.filter((event) => event.group_id === groupId)))
      .catch(() => setFailed(true))
  }, [groupId])

  return (
    <div className="person-list person-list-compact person-list-marker">
      <p className="card-subheading">Kommande events</p>
      {failed ? (
        <p className="hint-text">Kunde inte hämta events.</p>
      ) : events === null ? (
        <p className="hint-text">Laddar events...</p>
      ) : events.length === 0 ? (
        <p className="hint-text">Inga kommande events.</p>
      ) : (
        <ul>
          {events.map((event) => (
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
      )}
    </div>
  )
}

export default GroupEvents
