import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventWhenWhereText } from '../events/EventList'
import { getEvents } from '../../services/events'
import LoadError, { useRetry } from '../../shared/LoadError'

// Klubbens kommande events i klubbens vy: titel, tid och plats, och ett klick
// öppnar eventets egen vy på eventsidan (med klubben i adressen, så att Tillbaka
// går hit). Listan är alla events man får se som hör till klubben, hämtade med
// group_id (passerade är redan dolda av backend), tidigast först.
function GroupEvents({ groupId }) {
  const [events, setEvents] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
  const [attempt, retry] = useRetry()

  useEffect(() => {
    setEvents(null)
    setFailed(false)
    getEvents(groupId)
      .then(setEvents)
      .catch(() => setFailed(true))
  }, [groupId, attempt])

  // Inga kommande events: ingen tom rubrik heller (SCRUM-328). Inte heller medan de laddas, så att den inte blinkar till.
  if (!failed && !events?.length) return null

  return (
    <div className="person-list person-list-compact person-list-marker">
      <p className="card-subheading">Kommande events</p>
      {failed ? (
        <LoadError text="Kunde inte hämta events." onRetry={retry} className="hint-text" />
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <Link to={`/events?event=${event.id}&klubb=${groupId}`} className="person-list-item">
                <span>{event.title}</span>
                <span className="hint-text">
                  {eventWhenWhereText(event)}
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
