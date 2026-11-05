import { useState } from 'react'
import { CHOSEN_DESIGN } from '../app/chosenDesign'
import { MAP_PICKERS } from '../map/themes'

// Bara i testläget: välj hur kartan ser ut. Varje val sparas i webbläsaren och läggs som ett data-attribut på <html>
// (se useDesignChoice), även i mobilvyns ram. Förvalt är det valda utseendet (app/chosenDesign.js).
const PICKERS = [
  ...MAP_PICKERS.map(({ key, attr, label, options }) => ({
    key,
    attr,
    label,
    fallback: 'pre-dev',
    options: options.map((option, index) => ({ id: option.id, label: `${index}. ${option.label}` })),
  })),
]

// Förvalt är det valda utseendet (app/chosenDesign.js), så att testläget börjar med samma sak som alla andra ser.
function fallbackFor({ attr, fallback }) {
  return CHOSEN_DESIGN[attr] ?? fallback
}

function saved(picker) {
  try {
    return window.localStorage.getItem(picker.key) ?? fallbackFor(picker)
  } catch {
    return fallbackFor(picker)
  }
}

function apply({ attr }, id) {
  document.documentElement.dataset[attr] = id
}

// Direkt när testläget startar, och när ett val ändras i ett annat fönster (mobilvyns ram).
PICKERS.forEach((picker) => apply(picker, saved(picker)))
window.addEventListener('storage', (event) => {
  const picker = PICKERS.find((p) => p.key === event.key)
  if (picker) apply(picker, event.newValue ?? fallbackFor(picker))
})

function StylePicker({ picker }) {
  const [value, setValue] = useState(() => saved(picker))
  const id = `dev-panel-${picker.key}`

  function choose(next) {
    setValue(next)
    apply(picker, next)
    try {
      window.localStorage.setItem(picker.key, next)
    } catch {
      // Sparas inte, men stilen byts ändå.
    }
  }

  return (
    <>
      <label htmlFor={id}>{picker.label}</label>
      <select id={id} value={value} onChange={(e) => choose(e.target.value)}>
        {picker.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}

function StylePickers() {
  return PICKERS.map((picker) => <StylePicker key={picker.key} picker={picker} />)
}

export default StylePickers
