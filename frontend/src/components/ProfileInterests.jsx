import { useEffect, useRef, useState } from 'react'
import InterestPicker from './InterestPicker'
import { addInterest, getAllInterests, getMyInterests, removeInterest } from '../services/interests'

// Den inloggade användarens intressen. Hämtar och sparar själv, så att
// profilsidan inte behöver hålla koll på dem. Varje klick sparas direkt.
function ProfileInterests() {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [allInterests, setAllInterests] = useState([])
  const [myInterests, setMyInterests] = useState([])
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const savedTimer = useRef(null)

  useEffect(() => {
    Promise.all([getAllInterests(), getMyInterests()])
      .then(([all, mine]) => {
        setAllInterests(all)
        setMyInterests(mine)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
    return () => clearTimeout(savedTimer.current)
  }, [])

  // Taggen uppdateras direkt och återställs om anropet misslyckas.
  async function toggleInterest(id, add) {
    const previous = myInterests
    const interest = allInterests.find((i) => i.id === id)
    setMyInterests(add ? [...previous, interest] : previous.filter((i) => i.id !== id))
    setError('')
    try {
      setMyInterests(add ? await addInterest(id) : await removeInterest(id))
      setSavedMessage(`Sparat: ${interest.name} ${add ? 'tillagt' : 'borttaget'}`)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSavedMessage(''), 2000)
    } catch (err) {
      setMyInterests(previous)
      setError(err.message)
    }
  }

  return (
    <section className="profile-interests">
      <h2>Intressen</h2>
      {status === 'loading' && <p className="hint-text">Laddar intressen...</p>}
      {status === 'error' && (
        <p className="status-error">Kunde inte hämta intressen. Försök igen senare.</p>
      )}
      {status === 'ready' && (
        <>
          <p className="hint-text">Klicka för att välja. Ändringen sparas direkt.</p>
          <InterestPicker allInterests={allInterests} selected={myInterests} onToggle={toggleInterest} />
          {error && <p className="status-error">{error}</p>}
          <p className="status-success" aria-live="polite">
            {savedMessage}
          </p>
        </>
      )}
    </section>
  )
}

export default ProfileInterests
