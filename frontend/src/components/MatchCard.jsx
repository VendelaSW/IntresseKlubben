import { useDesignChoice } from '../hooks/useDesignChoice'
import { posterStrip } from '../utils/matchPoster'
import MatchLevel from './MatchLevel'
import PersonCard from './PersonCard'

// "A, B och C", med namnen i fetstil.
function joinNames(names) {
  const parts = []
  names.forEach((name, i) => {
    if (i > 0) parts.push(i === names.length - 1 ? ' och ' : ', ')
    parts.push(<strong key={name}>{name}</strong>)
  })
  return parts
}

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
// "Därför matchar ni" med skälen som punkter. `match` är ett förslag från GET /matches. Knapparna är Skicka kompisförfrågan,
// Gå vidare (visa nästa utan att ta bort något, bara om `onSkip` skickas med) och Ta bort förslag (försvinner för gott, med
// Ångra). `sharedInterestIds` (en Set) markerar gemensamma intressen med en bock, och bara de: skälen har egna punkter.
// TILLFÄLLIGT (testläget): matchningssidan finns i flera layouter (väljaren "Matchningssidan"). I "Nicklas förslag 1" är
// kortet en affisch (.match-card-poster) och "Gå vidare" är pilarna vid sidorna (MatchPanel), så då skickas inget `onSkip`.
// `poster` tvingar affischen oavsett val (för stilguiden).
function MatchCard({ match, sharedInterestIds, busy, onSend, onSkip, onDismiss, poster }) {
  const reasons = reasonLines(match.reasons)
  // TILLFÄLLIGT (testläget): utseendet "gnistor" står under namnet i stället för i hörnet (se MatchLevel).
  const sparks = useDesignChoice('matchCard') === 'gnistor'
  const layout = useDesignChoice('matchLayout')
  const isPoster = poster ?? layout === 'nicklas-1'
  // Raden överst på kortet har färgerna på personens områden, de ni har gemensamt först (se posterStrip).
  const [posterColor, posterStops] = posterStrip(match.interests, sharedInterestIds)

  return (
    <PersonCard
      className={`match-card${isPoster ? ' match-card-poster' : ''}`}
      poster={false}
      style={{ '--poster': posterColor, '--poster-strip': posterStops }}
      person={match}
      // Affischen visar bara staden (kommunen), i en svart ruta under namnet.
      place={isPoster ? match.municipality_name : undefined}
      sharedInterestIds={sharedInterestIds}
      badge={sparks ? null : <MatchLevel level={match.level} />}
      intro={
        <>
          {sparks && <MatchLevel level={match.level} />}
          {match.profile_text && <p className="match-about">{match.profile_text}</p>}
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
            {onSkip && (
              <button type="button" className="secondary-button button-small" disabled={busy} onClick={onSkip}>
                Gå vidare
              </button>
            )}
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
