import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useAuth } from '../hooks/useAuth'
import { getConversation, markConversationSeen, sendMessage } from '../services/messages'

// Hur ofta konversationen hämtas igen medan den är öppen, så att nya brev
// syns utan att man laddar om sidan.
const POLL_MS = 5000

const clock = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })
const dayAndMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

// När ett brev skickades, i användarens egen tid: "14:32" i dag, "igår 14:32",
// "7 okt. 14:32" tidigare i år och "7 okt. 2025 14:32" tidigare år.
function formatSentAt(value, now = new Date()) {
  const sent = new Date(value)
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const daysAgo = Math.round((startOfDay(now) - startOfDay(sent)) / 86400000)
  const time = clock.format(sent)
  // daysAgo kan bli negativt om datorns klocka går efter; visa då som i dag.
  if (daysAgo <= 0) return time
  if (daysAgo === 1) return `igår ${time}`
  const day = sent.getFullYear() === now.getFullYear() ? dayAndMonth.format(sent) : fullDate.format(sent)
  return `${day} ${time}`
}

// Samma meddelanden som vi redan visar? Meddelanden kan inte ändras eller
// tas bort, så antal och sista id räcker.
function sameMessages(a, b) {
  return a.length === b.length && a.at(-1)?.id === b.at(-1)?.id
}

// Hela konversationen med en specifik person (/meddelanden/:userId) +
// ett fält för att svara. Ingen bubbel-stil än, bara vanlig text, en sån
// ändring kräver nya klasser i stilguiden.
function ConversationPage() {
  const { userId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  // Vem konversationen är med (från servern), för namnet överst och vid breven.
  const [other, setOther] = useState(null)
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
    setOther(null)

    async function refresh() {
      if (fetching || document.hidden) return
      fetching = true
      try {
        const { user: person, messages: data } = await getConversation(userId)
        if (cancelled) return
        setOther(person)
        setMessages((current) => (sameMessages(current, data) ? current : data))
        setStatus('ready')
        // Det man ser i chatten räknas som läst, så att det inte blir en
        // badge när man sedan lämnar sidan.
        if (data.length > 0) markConversationSeen(person.id, data.at(-1).created_at)
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
  }, [userId])

  // Tillbaka dit man kom ifrån (t.ex. någons profil), som på profilsidan.
  // Öppnades chatten direkt via en länk finns ingen tidigare sida i appen, och
  // då går vi till Brev i stället för ut ur appen. window.history.state.idx är
  // satt av react-router och är 0 bara för sidans allra första post.
  function handleBack() {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate('/meddelanden')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const message = await sendMessage(Number(userId), text)
      setText('')
      // Visa det skickade brevet direkt, i stället för att vänta på nästa hämtning.
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]))
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const otherName = other ? (other.name ?? other.username) : ''

  return (
    <div className="content-stack conversation-page">
      <BackButton onClick={handleBack} />
      <h1>{otherName}</h1>

      {/* En vänsterställd spalt mitt på sidan, lika bred som tillbaka-raden. */}
      <div className="conversation">
        {status === 'loading' && <p className="hint-text">Laddar...</p>}
        {status === 'error' && (
          <p className="status-error">Kunde inte hämta konversationen. Försök igen senare.</p>
        )}
        {status === 'ready' && messages.length === 0 && <p className="hint-text">Inga brev än.</p>}
        {status === 'ready' && messages.length > 0 && (
          <div className="conversation-messages">
            {/* Namn och tid som en rad överst, meddelandet under (som i de flesta chattar). */}
            {messages.map((m) => (
              <div key={m.id} className="message">
                <p className="card-text">
                  <strong>{m.sender_id === user.id ? 'Du' : otherName}</strong>{' '}
                  <time className="hint-text" dateTime={m.created_at}>
                    {formatSentAt(m.created_at)}
                  </time>
                </p>
                <p className="card-text">{m.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* form-wide: lika brett som spalten, så att fältet linjerar med meddelandena. */}
        <form className="auth-form form-wide" onSubmit={handleSubmit}>
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
    </div>
  )
}

export default ConversationPage
