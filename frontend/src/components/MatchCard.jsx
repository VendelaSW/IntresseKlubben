import { joinNames } from '../utils/joinNames'
import MatchLevel from './MatchLevel'
import PersonCard from './PersonCard'
import { PosterAbout } from './Poster'

// Skälen till förslaget (`reasons` från GET /matches) som meningar. Backend skickar vad, den här skriver meningen. Bara det
// som kortet visar redan: inga siffror. "practices" (intressen ni båda utövar) visas inte, utövar är inte avgjort.
function reasonLines(reasons) {
  const lines = []
  for (const reason of reasons ?? []) {
    if (reason.kind === 'shared') lines.push({ key: 'shared', text: <>Ni delar {joinNames(reason.interests)}</> })
    else if (reason.kind === 'near') lines.push({ key: 'near', text: 'Ni har liknande intressen' })
    else if (reason.kind === 'text') lines.push({ key: 'text', text: 'Era presentationer låter lika' })
    else if (reason.kind === 'area') {
      lines.push({ key: 'area', text: <>Ni är båda intresserade av {joinNames(reason.interests)}</> })
    }
  }
  return lines
}

// Ett förslag i Matcha-fliken: personkortet (PersonCard) med nivån i hörnet, personens Om mig-text i sin helhet och
// "Därför matchar ni" med skälen som punkter, som en affisch (components/Poster.jsx). `match` är ett förslag från GET /matches.
// Knapparna är Skicka kompisförfrågan och Ta bort förslag (försvinner för gott, med Ångra); vidare och tillbaka går man
// med pilarna vid kortet (MatchPanel). `sharedInterestIds` (en Set) markerar gemensamma intressen med en bock, och bara de:
// skälen har egna punkter.
function MatchCard({ match, sharedInterestIds, busy, onSend, onDismiss }) {
  const reasons = reasonLines(match.reasons)

  return (
    <PersonCard
      className="match-card"
      person={match}
      sharedInterestIds={sharedInterestIds}
      badge={<MatchLevel level={match.level} />}
      intro={
        <>
          <PosterAbout text={match.profile_text} clamp />
          {reasons.length > 0 && (
            <>
              <p className="match-why-title">Därför matchar ni</p>
              <ul className="match-reasons">
                {reasons.map((reason) => (
                  <li key={reason.key}>{reason.text}</li>
                ))}
              </ul>
            </>
          )}
        </>
      }
      actions={
        <div className="match-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={onSend}>
            Skicka kompisförfrågan
          </button>
          <div className="match-actions-row">
            <button type="button" className="text-button" disabled={busy} onClick={onDismiss}>
              Ta bort förslag
            </button>
          </div>
        </div>
      }
    />
  )
}

export default MatchCard
