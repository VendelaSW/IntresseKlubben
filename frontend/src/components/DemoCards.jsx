import { Link } from 'react-router-dom'
import { useDemo } from '../hooks/useDemo'

export function DemoBackLink({ to = '/demo', children = '← Tillbaka' }) {
  return (
    <Link to={to} className="home-link">
      {children}
    </Link>
  )
}

// Intressen som visningstaggar. Gemensamma intressen markeras gula.
export function InterestTags({ interests, highlight = [] }) {
  return (
    <ul className="tags">
      {interests.map((interest) => (
        <li key={interest}>
          <span className={`tag tag-static${highlight.includes(interest) ? ' tag-selected' : ''}`}>
            {interest}
          </span>
        </li>
      ))}
    </ul>
  )
}

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Knappen ändras efter hur relationen till personen ser ut just nu.
function RelationActions({ person }) {
  const { relations, sendRequest, cancelRequest, acceptRequest, declineRequest, removeContact } = useDemo()
  const relation = relations[person.id]

  if (relation === 'incoming') {
    return (
      <div className="card-actions">
        <button type="button" className="primary-button" onClick={() => acceptRequest(person.id)}>
          Acceptera
        </button>
        <button type="button" className="secondary-button" onClick={() => declineRequest(person.id)}>
          Avböj
        </button>
      </div>
    )
  }
  if (relation === 'sent') {
    return (
      <div className="card-actions">
        <span className="status-pill">Förfrågan skickad</span>
        <button type="button" className="text-button" onClick={() => cancelRequest(person.id)}>
          Ångra
        </button>
      </div>
    )
  }
  if (relation === 'contact') {
    return (
      <div className="card-actions">
        <span className="status-pill status-pill-success">Kontakt</span>
        <button type="button" className="text-button" onClick={() => removeContact(person.id)}>
          Ta bort
        </button>
      </div>
    )
  }
  return (
    <div className="card-actions">
      <button type="button" className="primary-button" onClick={() => sendRequest(person.id)}>
        Skicka förfrågan
      </button>
    </div>
  )
}

export function PersonCard({ person, shared = [] }) {
  return (
    <article className="card demo-card">
      <div className="card-avatar card-avatar-initials" aria-hidden="true">
        {initials(person.name)}
      </div>
      <p className="card-title">
        {person.name}, {person.age}
      </p>
      <p className="card-subheading">
        {person.district}, {person.municipality} · {person.distanceKm.toString().replace('.', ',')} km
      </p>
      <p className="card-text">{person.bio}</p>
      <InterestTags interests={person.interests} highlight={shared} />
      {shared.length > 0 && (
        <p className="hint-text">
          {shared.length === 1 ? '1 gemensamt intresse' : `${shared.length} gemensamma intressen`}
        </p>
      )}
      <RelationActions person={person} />
    </article>
  )
}

export function ClubCard({ club, highlight = [] }) {
  const { toggleClub } = useDemo()
  return (
    <article className="card demo-card">
      <p className="card-title">{club.name}</p>
      <p className="card-subheading">
        {club.municipality} · {club.members} {club.members === 1 ? 'medlem' : 'medlemmar'}
      </p>
      <p className="card-text">{club.description}</p>
      {club.meets && <p className="hint-text">Träffas: {club.meets}</p>}
      <InterestTags interests={[club.interest]} highlight={highlight} />
      <div className="card-actions">
        {club.mine ? (
          <span className="status-pill status-pill-success">Du startade klubben</span>
        ) : club.joined ? (
          <>
            <span className="status-pill status-pill-success">Medlem</span>
            <button type="button" className="text-button" onClick={() => toggleClub(club.id)}>
              Lämna
            </button>
          </>
        ) : (
          <button type="button" className="primary-button" onClick={() => toggleClub(club.id)}>
            Gå med
          </button>
        )}
      </div>
    </article>
  )
}
