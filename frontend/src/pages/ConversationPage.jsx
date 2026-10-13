import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import BackButton from '../components/BackButton'
import { useAuth } from '../hooks/useAuth'
import { useCanGoBack } from '../hooks/useCanGoBack'
import { getConversation, markConversationSeen, sendMessage } from '../services/messages'
import { getProfile } from '../services/profile'
import { formatSentAt } from '../utils/formatSentAt'

// Hur ofta konversationen hämtas igen medan den är öppen, så att nya brev
// syns utan att man laddar om sidan.
const POLL_MS = 5000

// Samma brytpunkt som i index.css: under den ligger pappret längst ner.
const MOBILE_QUERY = '(max-width: 767px)'

// Samma meddelanden som vi redan visar? Meddelanden kan inte ändras eller
// tas bort, så antal och sista id räcker.
function sameMessages(a, b) {
  return a.length === b.length && a.at(-1)?.id === b.at(-1)?.id
}

// Hela konversationen med en specifik person (/meddelanden/:userId) på ett
// linjerat anteckningspapper (.notepad i stilguiden), och en rad för att svara.
function ConversationPage() {
  const { userId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  // Vem konversationen är med (från servern), för namnet överst och vid breven.
  const [other, setOther] = useState(null)
  // Den egna profilen, för ens egen bild vid ens egna brev.
  const [myProfile, setMyProfile] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getProfile()
      .then(setMyProfile)
      // Bilden är bara en extra: utan den visas initialen.
      .catch(() => {})
  }, [])

  // Mobil: pappret ligger längst ner, så skrolla dit när brev tillkommer (även
  // när sidan öppnas), så att de senaste breven och svarsraden syns.
  useEffect(() => {
    if (messages.length > 0 && window.matchMedia(MOBILE_QUERY).matches) {
      window.scrollTo({ top: document.documentElement.scrollHeight })
    }
  }, [messages.length])

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
  // då går vi till Brev i stället för ut ur appen (se useCanGoBack).
  function handleBack() {
    if (canGoBack()) {
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

      {/* Konversationen på ett linjerat anteckningspapper: varje rad text står på
          en linje. På mobil ligger pappret längst ner, där man skriver. */}
      <article className="notepad lined-paper">
        <h1 className="notepad-title">
          {other && (
            <Avatar name={otherName} imageUrl={other.image_url} className="person-list-avatar notepad-title-avatar" />
          )}
          <span className="notepad-title-name">{otherName}</span>
        </h1>

        {status === 'loading' && <p className="hint-text">Laddar...</p>}
        {status === 'error' && (
          <p className="status-error">Kunde inte hämta konversationen. Försök igen senare.</p>
        )}
        {status === 'ready' && messages.length === 0 && <p className="hint-text">Inga brev än.</p>}
        {status === 'ready' && messages.length > 0 && (
          <ol className="notepad-messages">
            {/* Namn och tid som en rad överst, meddelandet under (som i de flesta chattar). */}
            {messages.map((m) => (
              <li key={m.id} className="notepad-message">
                <p>
                  <Avatar
                    name={m.sender_id === user.id ? myProfile?.name : otherName}
                    imageUrl={m.sender_id === user.id ? myProfile?.image_url : other?.image_url}
                    className="person-list-avatar notepad-message-avatar"
                  />
                  {/* Ditt namn med den gula överstrykningspennan, som namnet på startsidan. */}
                  <strong className={m.sender_id === user.id ? 'highlight' : undefined}>
                    {m.sender_id === user.id ? 'Du' : otherName}
                  </strong>{' '}
                  <time className="hint-text" dateTime={m.created_at}>
                    {formatSentAt(m.created_at)}
                  </time>
                </p>
                <p>{m.text}</p>
              </li>
            ))}
          </ol>
        )}

        {/* Svarsraden är exakt en rad hög, så att texten står på linjen. */}
        <form className="notepad-reply" onSubmit={handleSubmit}>
          <label htmlFor="reply-text" className="visually-hidden">
            {`Skriv till ${otherName}`.trim()}
          </label>
          <input
            id="reply-text"
            type="text"
            placeholder={otherName ? `Skriv till ${otherName}...` : 'Skriv till...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
          <button type="submit" className="primary-button button-small" disabled={sending}>
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </article>
    </div>
  )
}

export default ConversationPage
