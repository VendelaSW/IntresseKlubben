import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import { getGroupMembers } from '../../services/groups'
import LoadError, { useRetry } from '../LoadError'

// Vilka som är med i klubben. Varje namn länkar till personens profil, där
// man kan skicka kompisförfrågan eller meddelande. `memberCount` gör att listan
// hämtas om när någon går med eller går ur.
function GroupMembers({ groupId, memberCount }) {
  const [members, setMembers] = useState(null)
  const [failed, setFailed] = useState(false)
  const [attempt, retry] = useRetry()

  useEffect(() => {
    setFailed(false)
    getGroupMembers(groupId)
      .then(setMembers)
      .catch(() => setFailed(true))
  }, [groupId, memberCount, attempt])

  if (failed) return <LoadError text="Kunde inte hämta medlemmarna." onRetry={retry} className="hint-text" />
  if (members === null) return <p className="hint-text">Laddar medlemmar...</p>

  return (
    <div className="person-list person-list-compact group-members">
      <p className="card-subheading">Medlemmar</p>
      <ul>
        {members.map((m) => (
          <li key={m.id}>
            <Link to={`/anvandare/${m.id}`} className="person-list-item">
              <Avatar name={m.name ?? m.username} imageUrl={m.image_url} className="person-list-avatar" />
              <span>{m.name ?? m.username}</span>
              {m.role === 'owner' && <span className="hint-text">Ägare</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default GroupMembers
