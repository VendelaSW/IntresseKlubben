import { useEffect, useState } from 'react'

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
// Så långt bakåt som årslistan går.
const OLDEST = 110

const pad = (n) => String(n).padStart(2, '0')
const daysIn = (year, month) => new Date(year || 2000, month, 0).getDate() // 2000 är skottår, så 29 feb går att välja innan året

// 'ÅÅÅÅ-MM-DD' → { year, month, day } som strängar ('' när värdet saknas).
function split(value) {
  const [year = '', month = '', day = ''] = value ? value.split('-') : []
  return { year, month: month && String(Number(month)), day: day && String(Number(day)) }
}

// Födelsedatum med tre listor: dag, månad och år, i stället för en kalender.
// Fungerar som ett datumfält: `value` är 'ÅÅÅÅ-MM-DD' ('' tills alla tre är
// valda) och `onChange` får det nya värdet. Datum i framtiden går inte att
// välja, och dagarna följer månaden (och skottår). `id` hamnar på dagslistan,
// så att etiketten pekar dit.
function BirthDatePicker({ id, value, onChange, required = false, autoFocus = false }) {
  const [parts, setParts] = useState(() => split(value))

  // Ett värde utifrån (t.ex. när profilen har laddats) fyller i listorna.
  useEffect(() => {
    const { year, month, day } = parts
    const current = year && month && day ? `${year}-${pad(month)}-${pad(day)}` : ''
    if (value !== current) setParts(split(value))
  }, [value])

  const today = new Date()
  const thisYear = today.getFullYear()
  const years = Array.from({ length: OLDEST + 1 }, (_, i) => thisYear - i)
  // I år går det bara fram till i dag.
  const lastMonth = Number(parts.year) === thisYear ? today.getMonth() + 1 : 12
  const isThisMonth = Number(parts.year) === thisYear && Number(parts.month) === today.getMonth() + 1
  const lastDay = isThisMonth ? today.getDate() : daysIn(Number(parts.year), Number(parts.month) || 1)

  function change(field, text) {
    const next = { ...parts, [field]: text }
    // En dag eller månad som inte finns längre (31 när man byter till april,
    // eller ett datum i framtiden) töms, så att man väljer om.
    const monthLimit = Number(next.year) === thisYear ? today.getMonth() + 1 : 12
    if (next.month && Number(next.month) > monthLimit) next.month = ''
    if (next.day && next.month) {
      const sameMonth = Number(next.year) === thisYear && Number(next.month) === today.getMonth() + 1
      const dayLimit = sameMonth ? today.getDate() : daysIn(Number(next.year), Number(next.month))
      if (Number(next.day) > dayLimit) next.day = ''
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
        {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select aria-label="Månad" value={parts.month} onChange={(e) => change('month', e.target.value)} required={required}>
        <option value="">Månad</option>
        {MONTHS.slice(0, lastMonth).map((name, i) => (
          <option key={name} value={i + 1}>
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
