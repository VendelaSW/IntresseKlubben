import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import BackButton from '../components/BackButton'
import ChatSender from '../components/ChatSender'
import { useAuth } from '../hooks/useAuth'
import { useCanGoBack } from '../hooks/useCanGoBack'
import { useChatScroll } from '../hooks/useChatScroll'
import { isIdle, onUserActive } from '../services/activity'
import { conversationQuery, markConversationRead, sendMessage } from '../services/messages'
import { getProfile } from '../services/profile'
import { formatSentAt } from '../utils/formatSentAt'

// Hur ofta konversationen hämtas igen medan den är öppen, så att nya brev
// syns utan att man laddar om sidan.
const POLL_MS = 5000

// Samma brytpunkt som i index.css: under den ligger pappret längst ner.
const MOBILE_QUERY = '(max-width: 767px)'

const NO_MESSAGES = []

// Hela konversationen med en specifik person (/meddelanden/:userId) på ett
// linjerat anteckningspapper (.notepad i stilguiden), och en rad för att svara.
function ConversationPage() {
  const { userId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  // Konversationen ur det delade minnet (se services/queryClient.js): har man
  // haft den öppen förut visas den direkt. Den hämtas när sidan öppnas och sedan
  // var POLL_MS, och direkt när man kommer tillbaka till fliken. När fliken inte
  // syns, eller ingen har rört appen på ett tag (se services/activity.js),
  // frågar den inte servern. Misslyckas en senare hämtning ligger breven kvar
  // och nästa försök kommer snart; bara den första visar fel.
  const { data, isSuccess, isError, refetch } = useQuery({
    ...conversationQuery(userId),
    refetchInterval: () => (isIdle() ? false : POLL_MS),
  })
  useEffect(() => onUserActive(() => refetch()), [refetch])
  const status = isSuccess ? 'ready' : isError ? 'error' : 'loading'
  // Vem konversationen är med (från servern), för namnet överst och vid breven.
  const other = data?.user ?? null
  const messages = data?.messages ?? NO_MESSAGES
  // Den egna profilen, för ens egen bild vid ens egna brev.
  const [myProfile, setMyProfile] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getProfile()
      .then(setMyProfile)
      // Bilden är bara en extra: utan den visas initialen.
      .catch(() => {})
  }, [])

  // Brevlistan scrollar i sin ruta och öppnas vid det senaste brevet (se useChatScroll).
  const { listRef, onScroll, stickToBottom } = useChatScroll(messages.length)

  // Mobil: pappret ligger längst ner, så skrolla dit när brev tillkommer (även
  // när sidan öppnas), så att de senaste breven och svarsraden syns.
  useEffect(() => {
    if (messages.length > 0 && window.matchMedia(MOBILE_QUERY).matches) {
      window.scrollTo({ top: document.documentElement.scrollHeight })
    }
  }, [messages.length])

  // Det man ser i chatten räknas som läst, och sparas på kontot (se
  // markConversationRead): när man öppnar konversationen och när ett nytt brev
  // kommer medan den är öppen. Bara en gång per nytt brev, inte vid varje
  // hämtning.
  const markedReadUpTo = useRef(null)
  useEffect(() => {
    const newest = messages.at(-1)
    if (!other || !newest || markedReadUpTo.current === newest.id) return
    markedReadUpTo.current = newest.id
    // Misslyckas det står brevet kvar som nytt, och nästa nya brev försöker igen.
    markConversationRead(other.id).catch(() => {})
  }, [other, messages])

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
    stickToBottom()
    setSending(true)
    setError('')
    try {
      // sendMessage lägger brevet i konversationen direkt, i stället för att
      // vänta på nästa hämtning.
      await sendMessage(Number(userId), text)
      setText('')
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
          {/* Bild och namn länkar till personens profil. */}
          {other ? (
            <Link to={`/anvandare/${other.id}`} className="notepad-title-link">
              <Avatar name={otherName} imageUrl={other.image_url} className="person-list-avatar notepad-title-avatar" />
              <span className="notepad-title-name">{otherName}</span>
            </Link>
          ) : (
            <span className="notepad-title-name">{otherName}</span>
          )}
        </h1>

        {status === 'loading' && <p className="hint-text">Laddar...</p>}
        {status === 'error' && (
          <p className="status-error">Kunde inte hämta konversationen. Försök igen senare.</p>
        )}
        {status === 'ready' && messages.length === 0 && <p className="hint-text">Inga brev än.</p>}
        {status === 'ready' && messages.length > 0 && (
          <ol className="notepad-messages" ref={listRef} onScroll={onScroll}>
            {/* Namn och tid som en rad överst, meddelandet under (som i de flesta chattar). */}
            {messages.map((m) => (
              <li key={m.id} className="notepad-message">
                <p>
                  <ChatSender
                    userId={other?.id}
                    mine={m.sender_id === user.id}
                    name={m.sender_id === user.id ? myProfile?.name : otherName}
                    imageUrl={m.sender_id === user.id ? myProfile?.image_url : other?.image_url}
                  />{' '}
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
