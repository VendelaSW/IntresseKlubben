import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import { getBlockedUsers, unblockUser } from '../services/contacts'

// De man själv har blockerat, med en knapp för att avblockera. Blockerade
// personer syns annars ingenstans i appen (inte ens deras profil går att
// öppna), så det här är stället man avblockerar. Visas bara om man har
// blockerat någon. Återanvänder klasserna från klubbarnas medlemslista.
function BlockedUsers() {
  const [blocked, setBlocked] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBlockedUsers()
      .then(setBlocked)
      .catch(() => setError('Kunde inte hämta dina blockerade användare.'))
  }, [])

  async function handleUnblock(userId) {
    setBusyId(userId)
    setError('')
    try {
      await unblockUser(userId)
      setBlocked((list) => list.filter((u) => u.id !== userId))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (blocked.length === 0 && !error) return null

  return (
    <section className="person-list">
      <h2>Blockerade användare</h2>
      {error && <p className="form-error">{error}</p>}
      <ul>
        {blocked.map((u) => (
          <li key={u.id}>
            <div className="person-list-item">
              <Avatar name={u.name ?? u.username} imageUrl={u.image_url} className="person-list-avatar" />
              <span>{u.name ?? u.username}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={busyId === u.id}
                onClick={() => handleUnblock(u.id)}
              >
                Avblockera
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default BlockedUsers
