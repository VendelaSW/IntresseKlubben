// Bocken: samma raka bock överallt (också i .interest-tag.is-shared i index.css). Färgen följer texten, och
// storleken följer textens storlek. Bara pynt, så den läses inte upp.
function CheckMark() {
  return (
    <svg className="check-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 13l4.5 4.5L19 7" />
    </svg>
  )
}

export default CheckMark
