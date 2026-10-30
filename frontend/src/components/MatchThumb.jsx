import { useDesignChoice } from '../hooks/useDesignChoice'
import { posterStrip } from '../utils/matchPoster'
import Avatar from './Avatar'
import MatchLevel from './MatchLevel'

// Ett av de närmast på tur i Matcha-fliken (se MatchPanel): ett litet kort under det stora, med avatar, namn, ort och
// nivån. Bara en förhandsvisning av ordningen (bäst först), inte klickbart. `place` är 1-4: ju längre bak i kön, desto
// mindre och svagare. Texten och skälen syns först när kortet blir stort.
// TILLFÄLLIGT (testläget): i layouten Nicklas förslag 1 (väljaren "Matchningssidan") är de små korten i samma
// affischstil som det stora (.match-thumb-poster), med raden överst i färgerna på personens områden. `poster` tvingar den
// (för stilguiden), och `sharedInterestIds` (en Set) låter de gemensamma områdena komma först i raden.
function MatchThumb({ match, place, sharedInterestIds, poster }) {
  const layout = useDesignChoice('matchLayout')
  const isPoster = poster ?? layout === 'nicklas-1'
  const name = match.name ?? match.username
  const [posterColor, posterStops] = posterStrip(match.interests, sharedInterestIds)
  return (
    <li
      className={`match-thumb match-thumb-${place}${isPoster ? ' match-thumb-poster' : ''}`}
      style={isPoster ? { '--poster': posterColor, '--poster-strip': posterStops } : undefined}
    >
      <Avatar name={name} imageUrl={match.image_url} className="match-thumb-avatar" maxLetters={2} />
      <span className="match-thumb-name">
        {name}
        {match.age ? `, ${match.age}` : ''}
      </span>
      {match.municipality_name && <span className="match-thumb-place">{match.municipality_name}</span>}
      <MatchLevel level={match.level} inline />
    </li>
  )
}

export default MatchThumb
