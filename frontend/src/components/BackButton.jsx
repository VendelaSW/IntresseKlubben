// "← Tillbaka" överst på en sida eller vy, ovanför rutan med innehållet (inte
// inuti den). Samma knapp överallt i appen, se stilguiden.
function BackButton({ onClick }) {
  return (
    <div className="back-row">
      <button type="button" className="secondary-button button-small" onClick={onClick}>
        ← Tillbaka
      </button>
    </div>
  )
}

export default BackButton
