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
  async function changeInterest(id, add) {
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

  if (status === 'loading') {
    return <p className="profile-hint">Laddar intressen...</p>
  }

  if (status === 'error') {
    return <p className="form-error">Kunde inte hämta intressen. Försök igen senare.</p>
  }

  return (
    <section className="profile-interests">
      <InterestPicker
        allInterests={allInterests}
        selected={myInterests}
        onAdd={(id) => changeInterest(id, true)}
        onRemove={(id) => changeInterest(id, false)}
      />
      {error && <p className="form-error">{error}</p>}
      <p className="profile-saved" aria-live="polite">
        {savedMessage}
      </p>
    </section>
  )
}

export default ProfileInterests
