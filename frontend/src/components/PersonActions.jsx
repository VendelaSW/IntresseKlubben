import { Link } from 'react-router-dom'
import brevIcon from '../assets/brev.png'

// Åtgärdsknapparna under ett personkort i Personer-flikarna Förslag/
// Förfrågningar/Kontakter. `relation` beskriver läget mellan den inloggade
// användaren och personen på kortet: null (inget), 'outgoing' (väntar på
// svar), 'incoming' (väntar på mitt svar) eller 'contact'. Knapparna är små
// (button-small), som "Gå med" på klubbkorten, så att korten håller sig kompakta.
// `userId`: personen på kortet. Alla kort har en liten knapp med brevikonen
// ("Skriv ett brev" som verktygstips och för skärmläsare), som öppnar
// brevtråden, så att det syns att man kan skriva till någon även innan man är
// kontakter. Bara ikonen, så att knapparna får plats på smala kort.
function PersonActions({ userId, relation, busy, onSend, onAccept, onDecline, onCancel, onRemove, onDismiss }) {
  const write = (
    <Link
      to={`/meddelanden/${userId}`}
      className="secondary-button button-small card-write"
      aria-label="Skriv ett brev"
      title="Skriv ett brev"
    >
      <img src={brevIcon} alt="" />
    </Link>
  )

  if (relation === 'incoming') {
    return (
      <div className="card-actions">
        <button type="button" className="primary-button button-small" disabled={busy} onClick={onAccept}>
          Acceptera
        </button>
        <button type="button" className="secondary-button button-small" disabled={busy} onClick={onDecline}>
          Avböj
        </button>
        {write}
      </div>
    )
  }

  if (relation === 'outgoing') {
    return (
      <div className="card-actions">
        <button type="button" className="secondary-button button-small" disabled={busy} onClick={onCancel}>
          Ångra förfrågan
        </button>
        {write}
      </div>
    )
  }

  if (relation === 'contact') {
    return (
      <div className="card-actions">
        <span className="status-pill status-pill-success">Kontakt</span>
        {write}
        <button type="button" className="text-button" disabled={busy} onClick={onRemove}>
          Ta bort
        </button>
      </div>
    )
  }

  return (
    <div className="card-actions">
      <button type="button" className="primary-button button-small" disabled={busy} onClick={onSend}>
        Skicka förfrågan
      </button>
      {write}
      <button type="button" className="text-button" disabled={busy} onClick={onDismiss}>
        Ta bort förslag
      </button>
    </div>
  )
}

export default PersonActions
