import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import { getGroupMembers } from '../../services/groups'

// Vilka som är med i klubben. Varje namn länkar till personens profil, där
// man kan skicka vänförfrågan eller meddelande. `memberCount` gör att listan
// hämtas om när någon går med eller går ur.
function GroupMembers({ groupId, memberCount }) {
  const [members, setMembers] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    getGroupMembers(groupId)
      .then(setMembers)
      .catch(() => setFailed(true))
  }, [groupId, memberCount])

  if (failed) return <p className="hint-text">Kunde inte hämta medlemmarna.</p>
  if (members === null) return <p className="hint-text">Laddar medlemmar...</p>

  return (
    <div className="person-list person-list-compact">
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
