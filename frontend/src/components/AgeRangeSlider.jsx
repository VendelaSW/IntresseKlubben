import { useEffect, useRef, useState } from 'react'
import { MAX_AGE, MIN_AGE } from '../utils/age'

const MIDDLE_AGE = (MIN_AGE + MAX_AGE) / 2

// Var på reglaget en ålder ligger, 0–100.
const percent = (age) => ((age - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100

// "Alla åldrar", "Från 30 år", "Upp till 40 år", "25–40 år" eller "40 år".
function ageText(low, high) {
  if (low === MIN_AGE && high === MAX_AGE) return 'Alla åldrar'
  if (low === high) return `${low} år`
  if (low === MIN_AGE) return `Upp till ${high} år`
  if (high === MAX_AGE) return `Från ${low} år`
  return `${low}–${high} år`
}

// Åldersfiltret (SCRUM-322): ett reglage med två handtag mellan 13 och 100 år (se utils/age.js). Kan användas på fler
// sidor som filtrerar på ålder. `value` är { min, max }, där null betyder ingen gräns åt det hållet (handtaget står i
// änden), och `onChange` får det nya. Det anropas först när man släpper handtaget (eller tangenten), så att listan inte
// hämtas om för varje år man drar förbi. Pilarna flyttar ett år i taget.
function AgeRangeSlider({ value, onChange }) {
  // Åldrarna medan man drar, annars null (då visas `value`). Samma sak i en ref, så att commit (som också anropas när
  // musknappen släpps var som helst på sidan) alltid ser de senaste, liksom `value` och `onChange`.
  const [dragging, setDragging] = useState(null)
  const latest = useRef({ dragging: null, value, onChange })
  useEffect(() => {
    latest.current.value = value
    latest.current.onChange = onChange
  })
  const [low, high] = dragging ?? [value.min ?? MIN_AGE, value.max ?? MAX_AGE]

  function move(handle, age) {
    const next = handle === 'min' ? [Math.min(age, high), high] : [low, Math.max(age, low)]
    latest.current.dragging = next
    setDragging(next)
  }

  function commit() {
    const { dragging: ages, value: current, onChange: report } = latest.current
    if (!ages) return
    latest.current.dragging = null
    setDragging(null)
    const next = { min: ages[0] === MIN_AGE ? null : ages[0], max: ages[1] === MAX_AGE ? null : ages[1] }
    if (next.min !== current.min || next.max !== current.max) report(next)
  }

  // Står handtagen på samma ålder ligger det handtag överst som går att dra därifrån: det undre i övre halvan och
  // det övre i nedre, annars kan man fastna.
  const minOnTop = low === high && low > MIDDLE_AGE
  const handle = (which, age, label) => (
    <input
      type="range"
      min={MIN_AGE}
      max={MAX_AGE}
      step={1}
      value={age}
      aria-label={label}
      aria-valuetext={`${age} år`}
      className={which === 'min' && minOnTop ? 'is-on-top' : undefined}
      onChange={(event) => move(which, Number(event.target.value))}
      // Släpps musknappen (eller fingret) utanför reglaget märks det ändå.
      onPointerDown={() => window.addEventListener('pointerup', commit, { once: true })}
      onKeyUp={commit}
      onBlur={commit}
    />
  )

  return (
    // Åldern till vänster och reglaget till höger, på en rad. "Ålder" står inte utskrivet (texten säger vad det är),
    // men läses upp för skärmläsare.
    <div className="age-range" role="group" aria-label="Ålder">
      <span className="age-range-value">{ageText(low, high)}</span>
      <div className="age-range-slider" style={{ '--low': percent(low), '--high': percent(high) }}>
        <div className="age-range-fill" />
        {handle('min', low, 'Lägsta ålder')}
        {handle('max', high, 'Högsta ålder')}
      </div>
    </div>
  )
}

export default AgeRangeSlider
