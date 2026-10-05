import { Link } from 'react-router-dom'
import InterestTags from './InterestTags'

function initials(name) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Ett kort för en annan användare. Avatar, namn och plats länkar till
// personens skrivskyddade profil. Åtgärdsknapparna (skicka/acceptera/ta
// bort) skickas in via `actions` och ligger utanför länken, så de inte
// hamnar nästlade i en <a> (ogiltig HTML och krockande klick).
// `sharedInterestIds` är valfri (en Set) och markerar gemensamma intressen.
function PersonCard({ person, sharedInterestIds, actions }) {
  // Kontakter/förfrågningar har bara username garanterat (inget namn valt än).
  const displayName = person.name ?? person.username
  const place = [person.district, person.municipality_name].filter(Boolean).join(', ')

  return (
    <article className="card card-interactive person-card">
      <Link to={`/anvandare/${encodeURIComponent(person.username)}`} className="person-card-link">
        {person.image_url ? (
          <img src={person.image_url} alt="" className="card-avatar" />
        ) : (
          <div className="card-avatar card-avatar-initials" aria-hidden="true">
            {initials(displayName)}
          </div>
        )}
        <p className="card-title">
          {displayName}
          {person.age ? `, ${person.age}` : ''}
        </p>
        {place && <p className="card-subheading">{place}</p>}
      </Link>
      {person.interests?.length > 0 && (
        <InterestTags interests={person.interests} highlight={sharedInterestIds} />
      )}
      {actions}
    </article>
  )
}

export default PersonCard
