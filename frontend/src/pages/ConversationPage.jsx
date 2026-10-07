import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getConversation, markConversationSeen, sendMessage } from '../services/messages'

// Hur ofta konversationen hämtas igen medan den är öppen, så att nya brev
// syns utan att man laddar om sidan.
const POLL_MS = 5000

// Samma meddelanden som vi redan visar? Meddelanden kan inte ändras eller
// tas bort, så antal och sista id räcker.
function sameMessages(a, b) {
  return a.length === b.length && a.at(-1)?.id === b.at(-1)?.id
}

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

  // Hämtar konversationen när sidan öppnas och sedan var POLL_MS. Pausar när
  // fliken inte syns (ingen idé att fråga servern då) och hämtar direkt när
  // man kommer tillbaka. Bara den första hämtningen visar fel; misslyckas en
  // senare hämtning ligger meddelandena kvar och nästa försök kommer snart.
  useEffect(() => {
    let cancelled = false // svar för en konversation man redan lämnat kastas
    let fetching = false // ingen ny hämtning medan den förra pågår
    setStatus('loading')
    setMessages([])

    async function refresh() {
      if (fetching || document.hidden) return
      fetching = true
      try {
        const data = await getConversation(username)
        if (cancelled) return
        setMessages((current) => (sameMessages(current, data) ? current : data))
        setStatus('ready')
        // Det man ser i chatten räknas som läst, så att det inte blir en
        // badge när man sedan lämnar sidan.
        if (data.length > 0) markConversationSeen(username, data.at(-1).created_at)
      } catch {
        if (!cancelled) setStatus((s) => (s === 'loading' ? 'error' : s))
      } finally {
        fetching = false
      }
    }

    function onVisibilityChange() {
      if (!document.hidden) refresh()
    }

    refresh()
    const timer = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [username])

  async function handleSubmit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const message = await sendMessage(username, text)
      setText('')
      // Visa det skickade brevet direkt, i stället för att vänta på nästa hämtning.
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]))
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
        <p className="hint-text">Inga brev än.</p>
      )}
      {status === 'ready' &&
        messages.map((m) => (
          <p key={m.id} className="card-text">
            <strong>{m.sender_id === user.id ? 'Du' : username}:</strong> {m.text}
          </p>
        ))}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="reply-text">Skriv ett brev</label>
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
