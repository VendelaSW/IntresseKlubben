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

// Ett kort för en annan användare i personlistan. Hela kortet länkar till
// personens skrivskyddade profil, samma route som UserProfilePage visar.
function PersonCard({ person }) {
  const place = [person.district, person.municipality_name].filter(Boolean).join(', ')

  return (
    <Link to={`/anvandare/${encodeURIComponent(person.username)}`} className="card person-card">
      {person.image_url ? (
        <img src={person.image_url} alt="" className="card-avatar" />
      ) : (
        <div className="card-avatar card-avatar-initials" aria-hidden="true">
          {initials(person.name)}
        </div>
      )}
      <p className="card-title">
        {person.name}
        {person.age ? `, ${person.age}` : ''}
      </p>
      {place && <p className="card-subheading">{place}</p>}
      <InterestTags interests={person.interests} />
    </Link>
  )
}

export default PersonCard
