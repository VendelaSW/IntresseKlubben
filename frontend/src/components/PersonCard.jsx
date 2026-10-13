import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import InterestTags from './InterestTags'

// Ett kort för en annan användare. Avatar, namn och plats länkar till
// personens skrivskyddade profil. Åtgärdsknapparna (skicka/acceptera/ta
// bort) skickas in via `actions` och ligger utanför länken, så de inte
// hamnar nästlade i en <a> (ogiltig HTML och krockande klick).
// `sharedInterestIds` är valfri (en Set) och markerar gemensamma intressen.
// `reason` är valfri: en kort förklaring till varför personen föreslås,
// t.ex. "Ni har 2 gemensamma intressen" (text eller JSX).
function PersonCard({ person, sharedInterestIds, reason, actions }) {
  // Kontakter/förfrågningar har bara username garanterat (inget namn valt än).
  const displayName = person.name ?? person.username
  const place = [person.district, person.municipality_name].filter(Boolean).join(', ')

  return (
    <article className="card card-interactive person-card">
      <Link to={`/anvandare/${person.id}`} className="person-card-link">
        <Avatar name={displayName} imageUrl={person.image_url} className="card-avatar" maxLetters={2} />
        <p className="card-title">
          {displayName}
          {person.age ? `, ${person.age}` : ''}
        </p>
        {place && <p className="card-subheading">{place}</p>}
      </Link>
      {reason && <p className="hint-text">{reason}</p>}
      {person.interests?.length > 0 && (
        <InterestTags interests={person.interests} highlight={sharedInterestIds} />
      )}
      {actions}
    </article>
  )
}

export default PersonCard
