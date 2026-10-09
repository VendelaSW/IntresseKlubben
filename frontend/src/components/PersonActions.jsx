// Åtgärdsknapparna under ett personkort i Personer-flikarna Förslag/
// Förfrågningar/Kontakter. `relation` beskriver läget mellan den inloggade
// användaren och personen på kortet: null (inget), 'outgoing' (väntar på
// svar), 'incoming' (väntar på mitt svar) eller 'contact'.
function PersonActions({ relation, busy, onSend, onAccept, onDecline, onCancel, onRemove, onDismiss }) {
  if (relation === 'incoming') {
    return (
      <div className="card-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={onAccept}>
          Acceptera
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onDecline}>
          Avböj
        </button>
      </div>
    )
  }

  if (relation === 'outgoing') {
    return (
      <div className="card-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
          Ångra förfrågan
        </button>
      </div>
    )
  }

  if (relation === 'contact') {
    return (
      <div className="card-actions">
        <span className="status-pill status-pill-success">Kontakt</span>
        <button type="button" className="text-button" disabled={busy} onClick={onRemove}>
          Ta bort
        </button>
      </div>
    )
  }

  return (
    <div className="card-actions">
      <button type="button" className="primary-button" disabled={busy} onClick={onSend}>
        Skicka förfrågan
      </button>
      <button type="button" className="text-button" disabled={busy} onClick={onDismiss}>
        Ta bort förslag
      </button>
    </div>
  )
}

export default PersonActions
