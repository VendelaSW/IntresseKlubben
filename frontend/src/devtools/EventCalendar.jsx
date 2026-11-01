import { useMemo, useState } from "react";
import EventList from "../components/events/EventList";
import "./eventCalendar.css";

// TILLFÄLLIGT, bara i testläget: en kalender över ens egna events, ett val mot listan på fliken Mina events (väljaren
// "Events: kalender", se EventsPanel och eventCalendar.css). En månad i taget med ett "YAY!" på dagar med event, och ett tryck
// på en dag visar dagens events som vanliga kort: bredvid kalendern på en bred skärm, under den på en smal. Utanför testläget visas inget av detta.
const WEEKDAYS = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"];
const monthName = new Intl.DateTimeFormat("sv-SE", {
  month: "long",
  year: "numeric",
});
const dayName = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Datumet som nyckel ("2026-11-03"), i den egna tidszonen.
const key = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// Dagarna i månadens rutnät: veckor från måndag, med dagar från månaden före och efter så att veckorna blir hela.
function gridDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7)); // getDay(): 0 = söndag
  const weeks = Math.ceil(
    (((first.getDay() + 6) % 7) +
      new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
      7,
  );
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

// Eventen per dag. Ett event över flera dygn syns på varje dag det pågår (högst 31, så att ett felaktigt slutdatum inte
// fyller kalendern).
function eventsByDay(events) {
  const days = new Map();
  events.forEach((event) => {
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : start;
    for (
      let day = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate(),
        ),
        n = 0;
      day <= end && n < 31;
      day = addDays(day, 1), n++
    ) {
      const k = key(day);
      days.set(k, [...(days.get(k) ?? []), event]);
    }
  });
  return days;
}

// Valet Lista/Kalender, och kalendern när den är vald. Listan visas av EventsPanel, som döljer den när kalendern är vald.
function EventCalendar({
  mode,
  onModeChange,
  events,
  myInterestIds,
  onSelect,
}) {
  const today = new Date();
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => key(today));
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const days = gridDays(month);
  const selectedEvents = (byDay.get(selected) ?? [])
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  function moveMonth(step) {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + step, 1),
    );
  }

  return (
    <>
      <div
        className="event-view-toggle"
        role="group"
        aria-label="Visa events som"
      >
        {[
          ["list", "Lista"],
          ["calendar", "Kalender"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "calendar" && (
        <div className="event-calendar">
          <div className="event-calendar-month">
            <div className="event-calendar-head">
              <button
                type="button"
                className="event-calendar-nav"
                aria-label="Föregående månad"
                onClick={() => moveMonth(-1)}
              >
                ‹
              </button>
              <h2 className="event-calendar-title">
                {monthName.format(month)}
              </h2>
              <button
                type="button"
                className="event-calendar-nav"
                aria-label="Nästa månad"
                onClick={() => moveMonth(1)}
              >
                ›
              </button>
            </div>

            <div
              className="event-calendar-grid"
              role="grid"
              aria-label={monthName.format(month)}
            >
              {WEEKDAYS.map((name) => (
                <span
                  key={name}
                  className="event-calendar-weekday"
                  role="columnheader"
                >
                  {name}
                </span>
              ))}
              {days.map((day) => {
                const k = key(day);
                const count = byDay.get(k)?.length ?? 0;
                const classes = ["event-calendar-day"];
                if (day.getMonth() !== month.getMonth())
                  classes.push("is-outside");
                if (k === key(today)) classes.push("is-today");
                if (k === selected) classes.push("is-selected");
                return (
                  <button
                    key={k}
                    type="button"
                    role="gridcell"
                    className={classes.join(" ")}
                    aria-pressed={k === selected}
                    aria-label={`${dayName.format(day)}${count ? `, ${count} ${count === 1 ? "event" : "events"}` : ""}`}
                    onClick={() => setSelected(k)}
                  >
                    <span className="event-calendar-number">
                      {day.getDate()}
                    </span>
                    {count > 0 && (
                      <span className="event-calendar-yay" aria-hidden="true">
                        YAY!
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="event-calendar-day-events">
            <h3 className="event-calendar-selected">
              {dayName.format(new Date(`${selected}T12:00:00`))}
            </h3>
            <EventList
              events={selectedEvents}
              emptyText="Inga events den här dagen."
              myInterestIds={myInterestIds}
              onSelect={onSelect}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default EventCalendar;
