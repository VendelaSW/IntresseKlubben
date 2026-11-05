import { usePadBack } from './PadHead'

// "← Tillbaka" överst på en sida eller vy, ovanför rutan med innehållet (inte
// inuti den). Samma knapp överallt i appen, se stilguiden. TILLFÄLLIGT: med den
// nya rubriken i testläget blir blockets rubrik knappen i stället ("← Klubbar"),
// så att den inte tar en egen rad (se usePadBack).
function BackButton({ onClick }) {
  const inPad = usePadBack(onClick)
  if (inPad) return null
  return (
    <div className="back-row">
      <button type="button" className="secondary-button button-small" onClick={onClick}>
        ← Tillbaka
      </button>
    </div>
  )
}

export default BackButton
