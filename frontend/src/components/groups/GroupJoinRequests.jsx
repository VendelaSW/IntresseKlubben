import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import { approveJoinRequest, declineJoinRequest, getJoinRequests } from '../../services/groups'

// Ansökningarna till en klubb man äger (SCRUM-159), i klubbens vy: namn (länk till
// profilen), meddelandet och Godkänn eller Neka. Den som ansökt får en notis
// med svaret, och kan ansöka igen efter ett nej. `onChanged` anropas när någon
// har godkänts (klubben har då en medlem till) eller nekats.
function GroupJoinRequests({ group, onChanged }) {
  const [requests, setRequests] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setFailed(false)
    getJoinRequests(group.id)
      .then(setRequests)
      .catch(() => setFailed(true))
  }, [group.id, group.request_count])

  async function answer(userId, action) {
    setBusyId(userId)
    setError('')
    try {
      await action(group.id, userId)
      setRequests((list) => list.filter((r) => r.user.id !== userId))
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="person-list person-list-compact group-requests">
      <p className="card-subheading">Ansökningar</p>
      {failed ? (
        <p className="hint-text">Kunde inte hämta ansökningarna.</p>
      ) : requests === null ? (
        <p className="hint-text">Laddar ansökningar...</p>
      ) : requests.length === 0 ? (
        <p className="hint-text">Inga ansökningar just nu.</p>
      ) : (
        <ul>
          {requests.map(({ user, message }) => (
            <li key={user.id} className="group-request">
              <Link to={`/anvandare/${user.id}`} className="person-list-item">
                <Avatar name={user.name ?? user.username} imageUrl={user.image_url} className="person-list-avatar" />
                <span>{user.name ?? user.username}</span>
              </Link>
              {message && <p className="group-request-message">”{message}”</p>}
              <div className="card-actions">
                <button
                  type="button"
                  className="primary-button button-small"
                  disabled={busyId !== null}
                  onClick={() => answer(user.id, approveJoinRequest)}
                >
                  Godkänn
                </button>
                <button
                  type="button"
                  className="secondary-button button-small"
                  disabled={busyId !== null}
                  onClick={() => answer(user.id, declineJoinRequest)}
                >
                  Neka
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="status-error">{error}</p>}
    </div>
  )
}

export default GroupJoinRequests
