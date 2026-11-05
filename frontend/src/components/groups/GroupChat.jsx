import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useChatScroll } from '../../hooks/useChatScroll'
import { isIdle, onUserActive } from '../../services/activity'
import { deleteGroupMessage, getGroupMembers, getGroupMessages, sendGroupMessage } from '../../services/groups'
import { useConfirm } from '../../hooks/useConfirm'
import { formatSentAt } from '../../utils/formatSentAt'
import { startsGroup } from '../../utils/messageGroups'
import ChatSender from '../ChatSender'
import { REPORT_TARGET } from '../../services/reports'
import ReportButton from '../ReportButton'

// Hur ofta chatten hämtas igen medan den är öppen, så att nya meddelanden syns utan att man laddar om sidan.
// Inte när ingen har rört appen på ett tag (se services/activity.js).
const POLL_MS = 5000

// Samma brytpunkt som i index.css: under den vill man se det senaste och svarsraden.
const MOBILE_QUERY = '(max-width: 767px)'

// Klubbens chatt på ett linjerat anteckningspapper (.notepad i stilguiden), som brevtråden. Ligger bredvid klubbens
// ruta på dator och under den på mobil (se GroupsPanel). Bara för medlemmar, och servern kontrollerar medlemskapet.
// Meddelandena scrollar i sin ruta och öppnas vid det senaste (se useChatScroll).
// `canModerate` (ägaren och administratörer, SCRUM-160): får ta bort andras meddelanden. Sina egna får alla ta bort.
function GroupChat({ groupId, canModerate = false }) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error' | 'denied'
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const revision = useRef(0)
  const submitting = useRef(false)
  const mounted = useRef(false)
  const replyRef = useRef(null)
  // Medlemmarna hämtas en gång när chatten öppnas, inte vid varje hämtning: listan ändras sällan. Kommer ett
  // meddelande från någon som saknas i listan (en ny medlem) hämtas den om, en gång per avsändare.
  const knownSenders = useRef(new Set())
  const refetchedFor = useRef(new Set())
  const membersLoaded = useRef(false)
  // Första gången meddelandena läses in ska sidan inte flyttas, bara när det kommer fler.
  const loadedOnce = useRef(false)
  const { listRef, onScroll, stickToBottom } = useChatScroll(messages.length)

  useEffect(() => {
    let cancelled = false
    let fetching = false
    let denied = false
    mounted.current = true

    async function loadMembers() {
      const people = await getGroupMembers(groupId)
      if (cancelled) return
      knownSenders.current = new Set(people.map((person) => person.id))
      membersLoaded.current = true
      setMembers(people)
    }

    async function refresh() {
      if (fetching || submitting.current || denied || document.hidden) return
      fetching = true
      const startedAtRevision = revision.current
      try {
        const history = await getGroupMessages(groupId)
        if (cancelled || startedAtRevision !== revision.current) return
        // Någon vi inte känner till har skrivit: hämta medlemmarna igen, en gång per avsändare.
        const unknown = history.filter(
          (message) => !knownSenders.current.has(message.sender_id) && !refetchedFor.current.has(message.sender_id),
        )
        if (unknown.length > 0 || !membersLoaded.current) {
          unknown.forEach((message) => refetchedFor.current.add(message.sender_id))
          await loadMembers()
          if (cancelled || startedAtRevision !== revision.current) return
        }
        setMessages(history)
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
          setStatus((current) => (current === 'loading' ? 'error' : current))
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
    const timer = setInterval(() => isIdle() || refresh(), POLL_MS)
    const stopListening = onUserActive(refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      mounted.current = false
      clearInterval(timer)
      stopListening()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [groupId])

  // Kommer det fler meddelanden (någon annans eller ens eget) på mobil bringas svarsraden i sikte, så att de
  // senaste syns. Inte första gången de läses in, så att sidan inte hoppar bara för att man öppnar klubben.
  useEffect(() => {
    if (status !== 'ready') return
    if (!loadedOnce.current) {
      loadedOnce.current = true
      return
    }
    if (window.matchMedia(MOBILE_QUERY).matches) {
      replyRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [messages.length, status])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = content.trim()
    if (!text || submitting.current || status !== 'ready') return
    stickToBottom()
    submitting.current = true
    revision.current += 1
    setSending(true)
    setError('')
    try {
      const message = await sendGroupMessage(groupId, text)
      if (!mounted.current) return
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]))
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

  async function handleDelete(message, name) {
    if (
      !(await confirm({
        title: 'Ta bort meddelandet',
        text: message.sender_id === user?.id ? 'Meddelandet tas bort för alla.' : `Meddelandet från ${name} tas bort för alla.`,
        confirmLabel: 'Ta bort',
        danger: true,
      }))
    )
      return
    setError('')
    try {
      await deleteGroupMessage(groupId, message.id)
      // En hämtning som redan pågår får inte lägga tillbaka det (se revision).
      revision.current += 1
      setMessages((current) => current.filter((item) => item.id !== message.id))
    } catch (err) {
      setError(err.message)
    }
  }

  function senderOf(senderId) {
    return members.find((person) => person.id === senderId)
  }

  const titleId = `group-chat-${groupId}`

  return (
    <section className="notepad lined-paper" aria-labelledby={titleId}>
      <h2 id={titleId} className="notepad-title">
        <span className="notepad-title-name">Klubbchatt</span>
      </h2>
      {status === 'loading' && (
        <p className="hint-text" role="status">
          Laddar meddelanden...
        </p>
      )}
      {refreshError && (
        <p className="status-error" role="alert">
          {refreshError}
        </p>
      )}
      {status === 'ready' && messages.length === 0 && <p className="hint-text">Inga meddelanden än.</p>}
      {messages.length > 0 && (
        <ol className="notepad-messages" ref={listRef} onScroll={onScroll}>
          {/* Namn och tid som en rad överst, meddelandet under, som i brevtråden. Meddelanden i
              följd från samma person hamnar under samma namn (se startsGroup). */}
          {messages.map((message, index) => {
            const first = startsGroup(messages, index)
            const mine = message.sender_id === user?.id
            const sender = senderOf(message.sender_id)
            const name = sender ? (sender.name ?? sender.username) : 'Tidigare medlem'
            const reportable = !mine && sender
            // Sina egna meddelanden får man ta bort, och ägaren och administratörer alla (SCRUM-160).
            const deletable = mine || canModerate
            return (
              <li
                key={message.id}
                className={`notepad-message${first ? '' : ' notepad-message-continued'}${reportable || deletable ? ' notepad-message-reportable' : ''}`}
              >
                {first && (
                  <p className="notepad-message-head">
                    <ChatSender userId={sender?.id} mine={mine} name={name} imageUrl={sender?.image_url} />{' '}
                    <time className="hint-text" dateTime={message.created_at}>
                      {formatSentAt(message.created_at)}
                    </time>
                  </p>
                )}
                <p title={first ? undefined : formatSentAt(message.created_at)}>{message.content}</p>
                {/* Ta bort (eget meddelande, eller som ägare och administratör) och Anmäl (andras), uppe till
                    höger när man hovrar (se .notepad-message-actions och .report-link). */}
                {(deletable || reportable) && (
                  <span className="notepad-message-actions">
                    {deletable && (
                      <button
                        type="button"
                        className="report-link"
                        aria-label={mine ? 'Ta bort ditt meddelande' : `Ta bort meddelandet från ${name}`}
                        onClick={() => handleDelete(message, name)}
                      >
                        Ta bort
                      </button>
                    )}
                    {reportable && (
                      <ReportButton
                        className="report-link"
                        label={`Anmäl meddelandet från ${name}`}
                        targetType={REPORT_TARGET.groupMessage}
                        targetId={message.id}
                        userId={sender.id}
                        name={name}
                        quote={message.content}
                      />
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {status !== 'denied' && (
        // Svarsraden är exakt en rad hög, så att texten står på linjen.
        <form className="notepad-reply" onSubmit={handleSubmit} ref={replyRef}>
          <label htmlFor={`group-reply-${groupId}`} className="visually-hidden">
            Skriv till klubben
          </label>
          <input
            id={`group-reply-${groupId}`}
            type="text"
            placeholder="Skriv till klubben..."
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={2000}
            required
            disabled={sending || status !== 'ready'}
          />
          <button type="submit" className="primary-button button-small" disabled={sending || status !== 'ready' || !content.trim()}>
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export default GroupChat
