import { useEffect, useState } from 'react'
import { getBlockedUsers, unblockUser } from '../services/contacts'

// De man själv har blockerat, med en knapp för att avblockera. Blockerade
// personer syns annars ingenstans i appen (inte ens deras profil går att
// öppna), så det här är stället man avblockerar. Visas bara om man har
// blockerat någon. Återanvänder klasserna från klubbarnas medlemslista.
function BlockedUsers() {
  const [blocked, setBlocked] = useState([])
  const [busyUsername, setBusyUsername] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBlockedUsers()
      .then(setBlocked)
      .catch(() => setError('Kunde inte hämta dina blockerade användare.'))
  }, [])

  async function handleUnblock(username) {
    setBusyUsername(username)
    setError('')
    try {
      await unblockUser(username)
      setBlocked((list) => list.filter((u) => u.username !== username))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyUsername(null)
    }
  }

  if (blocked.length === 0 && !error) return null

  return (
    <section className="person-list">
      <h2>Blockerade användare</h2>
      {error && <p className="form-error">{error}</p>}
      <ul>
        {blocked.map((u) => (
          <li key={u.username}>
            <div className="person-list-item">
              {u.image_url ? (
                <img src={u.image_url} alt="" className="person-list-avatar" />
              ) : (
                <span className="person-list-avatar card-avatar-initials" aria-hidden="true">
                  {(u.name ?? u.username).trim()[0]?.toUpperCase()}
                </span>
              )}
              <span>{u.name ?? u.username}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={busyUsername === u.username}
                onClick={() => handleUnblock(u.username)}
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
