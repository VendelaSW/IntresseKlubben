import { useMemo, useState } from 'react'
import DrawnArrow from '../components/DrawnArrow'
import EventList from '../components/events/EventList'
import './eventCalendar.css'

// TILLFÄLLIGT, bara i testläget: en kalender över ens egna events, på en egen flik efter Mina events (väljaren
// "Events: kalender", se EventsPanel och eventCalendar.css). Kalendern är ett anteckningsblock med spiral: en månad i taget,
// och på dagar med event ligger en post-it med eventets namn (på en smal skärm ett handskrivet "YAY!", eftersom lappen inte
// ryms). Ett tryck på en dag visar dagens events, centrerade: bredvid kalendern på en bred skärm, under den på en smal. Är
// det flera ligger de som en hög biljetter som man bläddrar i (EventStack).
// Pilarna är samma som på matchningskortet (.match-arrow). Utanför testläget visas inget av detta.
const WEEKDAYS = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön']
const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' })
const dayName = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })

// Lapparnas färger och lutning, i tur och ordning efter dagen i månaden så att de inte ser likadana ut.
const NOTE_COLORS = [
  'var(--color-pastel-yellow)',
  'var(--color-pastel-peach)',
  'var(--color-pastel-blue)',
  'var(--color-pastel-green)',
  'var(--color-pastel-rose)',
  'var(--color-pastel-lilac)',
]
const NOTE_TILTS = [-3, 2, -2, 3, -1, 2]

// Datumet som nyckel ("2026-11-03"), i den egna tidszonen.
const key = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

// Dagarna i månadens rutnät: veckor från måndag, med dagar från månaden före och efter så att veckorna blir hela.
function gridDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // getDay(): 0 = söndag
  const start = addDays(first, -offset)
  const weeks = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}

// Eventen per dag. Ett event över flera dygn syns på varje dag det pågår (högst 31, så att ett felaktigt slutdatum inte
// fyller kalendern).
function eventsByDay(events) {
  const days = new Map()
  events.forEach((event) => {
    const start = new Date(event.starts_at)
    const end = event.ends_at ? new Date(event.ends_at) : start
    let day = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    for (let n = 0; day <= end && n < 31; n++) {
      const k = key(day)
      days.set(k, [...(days.get(k) ?? []), event])
      day = addDays(day, 1)
    }
  })
  return days
}

// Dagens events som en hög biljetter: det första i tid ligger överst, med de andra som skymtar bakom, och pilarna bläddrar
// mellan dem. Har dagen inget event visas en tom ruta. `key` på överdelen ger en liten animation när biljetten byts.
function EventStack({ events, myInterestIds, onSelect }) {
  const [index, setIndex] = useState(0)
  if (events.length === 0) {
    return <EventList events={[]} emptyText="Inga events den här dagen." myInterestIds={myInterestIds} onSelect={onSelect} />
  }
  const count = events.length
  const top = Math.min(index, count - 1)
  const behind = Math.min(count - 1, 2)
  const go = (step) => setIndex((current) => (current + step + count) % count)

  return (
    <div className="event-stack">
      <div className="event-stack-pile" style={{ '--behind': behind }}>
        {/* De som ligger bakom är de nästa eventen, på riktigt, lite förskjutna och lutade. De går inte att trycka på. */}
        {Array.from({ length: behind }, (_, i) => behind - i).map((layer) => {
          const event = events[(top + layer) % count]
          return (
            <div key={event.id} className="event-stack-layer event-stack-back" style={{ '--layer': layer }} aria-hidden="true" inert="">
              <EventList events={[event]} emptyText="" myInterestIds={myInterestIds} onSelect={onSelect} />
            </div>
          )
        })}
        <div key={events[top].id} className="event-stack-layer event-stack-top">
          <EventList events={[events[top]]} emptyText="" myInterestIds={myInterestIds} onSelect={onSelect} />
        </div>
      </div>
      {count > 1 && (
        <div className="event-stack-controls">
          <button type="button" className="match-arrow" aria-label="Föregående event" onClick={() => go(-1)}>
            <DrawnArrow className="match-arrow-prev" />
          </button>
          <span className="event-stack-count">
            {top + 1} av {count}
          </span>
          <button type="button" className="match-arrow" aria-label="Nästa event" onClick={() => go(1)}>
            <DrawnArrow className="match-arrow-next" />
          </button>
        </div>
      )}
    </div>
  )
}

// Kalendern. EventsPanel visar den på fliken Kalender i stället för listan.
function EventCalendar({ events, myInterestIds, onSelect }) {
  const today = new Date()
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(() => key(today))
  const byDay = useMemo(() => eventsByDay(events), [events])
  const days = gridDays(month)
  const selectedEvents = (byDay.get(selected) ?? []).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  function moveMonth(step) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1))
  }

  return (
    <div className="event-calendar">
      <div className="event-calendar-month">
        <div className="event-calendar-head">
          <button type="button" className="match-arrow" aria-label="Föregående månad" onClick={() => moveMonth(-1)}>
            <DrawnArrow className="match-arrow-prev" />
          </button>
          <h2 className="event-calendar-title">{monthName.format(month)}</h2>
          <button type="button" className="match-arrow" aria-label="Nästa månad" onClick={() => moveMonth(1)}>
            <DrawnArrow className="match-arrow-next" />
          </button>
        </div>

        <div className="event-calendar-grid" role="grid" aria-label={monthName.format(month)}>
          {WEEKDAYS.map((name) => (
            <span key={name} className="event-calendar-weekday" role="columnheader">
              {name}
            </span>
          ))}
          {days.map((day) => {
            const k = key(day)
            const dayEvents = byDay.get(k) ?? []
            const count = dayEvents.length
            const classes = ['event-calendar-day']
            if (day.getMonth() !== month.getMonth()) classes.push('is-outside')
            if (k === key(today)) classes.push('is-today')
            if (k === selected) classes.push('is-selected')
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                className={classes.join(' ')}
                aria-pressed={k === selected}
                aria-label={`${dayName.format(day)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`}
                onClick={() => setSelected(k)}
              >
                <span className="event-calendar-number">{day.getDate()}</span>
                {count > 0 && (
                  <>
                    <span
                      className="event-calendar-note"
                      aria-hidden="true"
                      style={{
                        '--note': NOTE_COLORS[day.getDate() % NOTE_COLORS.length],
                        '--note-tilt': `${NOTE_TILTS[day.getDate() % NOTE_TILTS.length]}deg`,
                      }}
                    >
                      {dayEvents[0].title}
                      {count > 1 && ` +${count - 1}`}
                    </span>
                    <span className="event-calendar-yay" aria-hidden="true">
                      YAY!
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="event-calendar-day-events">
        <h3 className="event-calendar-selected">{dayName.format(new Date(`${selected}T12:00:00`))}</h3>
        <EventStack key={selected} events={selectedEvents} myInterestIds={myInterestIds} onSelect={onSelect} />
      </div>
    </div>
  )
}

export default EventCalendar
