import { useEffect, useState } from 'react'
import { MAX_AGE, MIN_AGE } from '../utils/age'

const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
]

const pad = (n) => String(n).padStart(2, '0')
const daysIn = (year, month) => new Date(year || 2000, month, 0).getDate() // 2000 är skottår, så 29 feb går att välja innan året

// Samma dag `years` år tidigare. Fanns inte dagen det året (29 februari) blir det 28 februari, som i backend
// (app/core/age.py): den som är född 1 mars har inte fyllt år än.
function yearsBefore(day, years) {
  const year = day.getFullYear() - years
  return new Date(year, day.getMonth(), Math.min(day.getDate(), daysIn(year, day.getMonth() + 1)))
}

// 'ÅÅÅÅ-MM-DD' → { year, month, day } som strängar ('' när värdet saknas).
function split(value) {
  const [year = '', month = '', day = ''] = value ? value.split('-') : []
  return { year, month: month && String(Number(month)), day: day && String(Number(day)) }
}

// Födelsedatum med tre listor: dag, månad och år, i stället för en kalender.
// Fungerar som ett datumfält: `value` är 'ÅÅÅÅ-MM-DD' ('' tills alla tre är
// valda) och `onChange` får det nya värdet. Man kan bara välja ett datum som ger
// en ålder mellan 13 och 100 år (se utils/age.js), samma regel som backend, och
// dagarna följer månaden (och skottår). `id` hamnar på dagslistan, så att
// etiketten pekar dit.
function BirthDatePicker({ id, value, onChange, required = false, autoFocus = false }) {
  const [parts, setParts] = useState(() => split(value))

  // Ett värde utifrån (t.ex. när profilen har laddats) fyller i listorna.
  useEffect(() => {
    const { year, month, day } = parts
    const current = year && month && day ? `${year}-${pad(month)}-${pad(day)}` : ''
    if (value !== current) setParts(split(value))
  }, [value])

  const today = new Date()
  // Det senaste datum man kan välja: den som fyller 13 i dag. Det tidigaste: dagen efter den som fyller 101 i dag,
  // alltså den äldsta som fortfarande är 100. De åren går det bara fram till respektive från de datumen.
  const latest = yearsBefore(today, MIN_AGE)
  const earliest = yearsBefore(today, MAX_AGE + 1)
  earliest.setDate(earliest.getDate() + 1)
  const lastYear = latest.getFullYear()
  const firstYear = earliest.getFullYear()
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i)

  // [första, sista] månaden som går att välja ett visst år, och dagen en viss månad (utan vald månad: 1–31).
  const monthsIn = (year) => [
    year === firstYear ? earliest.getMonth() + 1 : 1,
    year === lastYear ? latest.getMonth() + 1 : 12,
  ]
  const daysInMonth = (year, month) => [
    year === firstYear && month === earliest.getMonth() + 1 ? earliest.getDate() : 1,
    year === lastYear && month === latest.getMonth() + 1 ? latest.getDate() : daysIn(year, month || 1),
  ]
  const [firstMonth, lastMonth] = monthsIn(Number(parts.year))
  const [firstDay, lastDay] = daysInMonth(Number(parts.year), Number(parts.month))

  function change(field, text) {
    const next = { ...parts, [field]: text }
    // En dag eller månad som inte finns längre (31 när man byter till april,
    // eller ett datum utanför åldersgränsen) töms, så att man väljer om.
    const [monthFrom, monthTo] = monthsIn(Number(next.year))
    if (next.month && (Number(next.month) < monthFrom || Number(next.month) > monthTo)) next.month = ''
    if (next.day && next.month) {
      const [dayFrom, dayTo] = daysInMonth(Number(next.year), Number(next.month))
      if (Number(next.day) < dayFrom || Number(next.day) > dayTo) next.day = ''
    }
    setParts(next)
    const { year, month, day } = next
    onChange(year && month && day ? `${year}-${pad(month)}-${pad(day)}` : '')
  }

  return (
    <div className="birth-date-picker">
      <select
        id={id}
        aria-label="Dag"
        value={parts.day}
        onChange={(e) => change('day', e.target.value)}
        required={required}
        autoFocus={autoFocus}
      >
        <option value="">Dag</option>
        {Array.from({ length: lastDay - firstDay + 1 }, (_, i) => firstDay + i).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select aria-label="Månad" value={parts.month} onChange={(e) => change('month', e.target.value)} required={required}>
        <option value="">Månad</option>
        {MONTHS.map((name, i) => ({ name, number: i + 1 }))
          .filter(({ number }) => number >= firstMonth && number <= lastMonth)
          .map(({ name, number }) => (
            <option key={name} value={number}>
              {name}
            </option>
          ))}
      </select>
      <select aria-label="År" value={parts.year} onChange={(e) => change('year', e.target.value)} required={required}>
        <option value="">År</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  )
}

export default BirthDatePicker
