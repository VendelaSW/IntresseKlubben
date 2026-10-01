import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getConversation, sendMessage } from '../services/messages'

// Hela konversationen med en specifik person (/meddelanden/:username) +
// ett fält för att svara. Ingen bubbel-stil än, bara vanlig text, en sån
// ändring kräver nya klasser i stilguiden.
function ConversationPage() {
  const { username } = useParams()
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function load() {
    getConversation(username)
      .then((data) => {
        setMessages(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [username])

  async function handleSubmit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await sendMessage(username, text)
      setText('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="content-stack">
      <h1>{username}</h1>

      {status === 'loading' && <p className="hint-text">Laddar...</p>}
      {status === 'error' && (
        <p className="status-error">Kunde inte hämta konversationen. Försök igen senare.</p>
      )}
      {status === 'ready' && messages.length === 0 && (
        <p className="hint-text">Inga meddelanden än.</p>
      )}
      {status === 'ready' &&
        messages.map((m) => (
          <p key={m.id} className="card-text">
            <strong>{m.sender_id === user.id ? 'Du' : username}:</strong> {m.text}
          </p>
        ))}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="reply-text">Skriv ett meddelande</label>
        <input
          id="reply-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={sending}>
          {sending ? 'Skickar...' : 'Skicka'}
        </button>
      </form>
    </div>
  )
}

export default ConversationPage
