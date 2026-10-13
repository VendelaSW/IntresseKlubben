import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getGroupMembers, getGroupMessages, sendGroupMessage } from '../../services/groups'

const POLL_MS = 5000
const sentAt = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

function GroupChat({ groupId }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('loading')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const revision = useRef(0)
  const submitting = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    let cancelled = false
    let fetching = false
    let denied = false
    mounted.current = true

    async function refresh() {
      if (fetching || submitting.current || denied || document.hidden) return
      fetching = true
      const startedAtRevision = revision.current
      try {
        const [history, people] = await Promise.all([
          getGroupMessages(groupId), getGroupMembers(groupId),
        ])
        if (cancelled || startedAtRevision !== revision.current) return
        setMessages(history)
        setMembers(people)
        setStatus('ready')
        setRefreshError('')
      } catch (err) {
        if (cancelled || startedAtRevision !== revision.current) return
        if (err.status === 403 || err.status === 404) {
          denied = true
          setMessages([])
          setError('')
          setStatus('denied')
        } else {
          setStatus((current) => current === 'loading' ? 'error' : current)
        }
        setRefreshError(err.message)
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
      mounted.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [groupId])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = content.trim()
    if (!text || submitting.current || status !== 'ready') return
    submitting.current = true
    revision.current += 1
    setSending(true)
    setError('')
    try {
      const message = await sendGroupMessage(groupId, text)
      if (!mounted.current) return
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current : [...current, message])
      setContent('')
    } catch (err) {
      if (!mounted.current) return
      setError(err.message)
      if (err.status === 403 || err.status === 404) {
        setMessages([])
        setStatus('denied')
      }
    } finally {
      revision.current += 1
      submitting.current = false
      if (mounted.current) setSending(false)
    }
  }

  function senderName(senderId) {
    if (senderId === user?.id) return 'Du'
    const member = members.find((person) => person.id === senderId)
    return member ? (member.name ?? member.username) : 'Tidigare medlem'
  }

  return (
    <section className="conversation" aria-labelledby={`group-chat-${groupId}`}>
      <h2 id={`group-chat-${groupId}`} className="card-subheading">Klubbchatt</h2>
      {status === 'loading' && <p className="hint-text" role="status">Laddar meddelanden...</p>}
      {refreshError && <p className="status-error" role="alert">{refreshError}</p>}
      {status === 'ready' && messages.length === 0 && <p className="hint-text">Inga meddelanden än.</p>}
      <div className="conversation-messages">
        {messages.map((message) => (
          <div className="message" key={message.id}>
            <p className="card-text">
              <strong>{senderName(message.sender_id)}</strong>{' '}
              <time className="hint-text" dateTime={message.created_at}>
                {sentAt.format(new Date(message.created_at))}
              </time>
            </p>
            <p className="card-text" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {message.content}
            </p>
          </div>
        ))}
      </div>
      {status !== 'denied' && (
        <form className="auth-form form-wide" onSubmit={handleSubmit}>
          <label htmlFor={`group-reply-${groupId}`}>Skriv ett meddelande</label>
          <textarea
            id={`group-reply-${groupId}`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            maxLength={2000}
            required
            disabled={sending || status !== 'ready'}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" disabled={sending || status !== 'ready' || !content.trim()}>
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </form>
      )}
      {status === 'denied' && error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

export default GroupChat