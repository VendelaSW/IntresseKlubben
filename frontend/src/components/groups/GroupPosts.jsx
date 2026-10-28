import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  createGroupPost,
  deleteGroupPost,
  getGroupMembers,
  getGroupPosts,
  pinGroupPost,
  unpinGroupPost,
} from '../../services/groups'
import { REPORT_TARGET } from '../../services/reports'
import { formatSentAt } from '../../utils/formatSentAt'
import Avatar from '../Avatar'
import ChatSender from '../ChatSender'
import Modal from '../Modal'
import ReportButton from '../ReportButton'
import { useConfirm } from '../../hooks/useConfirm'
import LoadError, { useRetry } from '../LoadError'

// Samma gräns som i backend (schemas/group_post.py).
const MAX_LENGTH = 2000
// Så många lappar syns på dator innan man trycker "Visa alla". På mobil ligger
// alla i ett rutnät som går att skrolla (se .board-notes i index.css).
const SHOWN_ON_DESKTOP = 4

// Samma ordning som servern (crud/group_post.py): den fastnålade först, sedan
// nyaste först.
function sortPosts(list) {
  return [...list].sort(
    (a, b) =>
      Boolean(b.pinned_at) - Boolean(a.pinned_at) ||
      b.created_at.localeCompare(a.created_at) ||
      b.id - a.id,
  )
}

// Klubbens anslagstavla, en egen vy i klubben (knappen Anslagstavla, se
// GroupsPanel): lappar med nyheter och regler som ligger kvar, nyaste först,
// till skillnad från chatten. `full` = hela tavlan med alla lappar, som en stor
// kork som fyller blocket.
// Lapparna ser ut som kartans lappar (.paper-note). En lapp visar högst tre
// rader; ett klick öppnar hela lappen i en popup, där den som satte upp den och
// klubbens ägare (`isOwner`) kan ta ner den. Ägaren kan också nåla fast en lapp
// i taget, som då alltid ligger först och bara ägaren kan ta ner. Bara för
// medlemmar, och servern kontrollerar medlemskapet.
function GroupPosts({ groupId, isOwner, full = false }) {
  const confirm = useConfirm()
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [writing, setWriting] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(full)
  // Lappen som visas i popupen, eller null.
  const [openPost, setOpenPost] = useState(null)
  const [attempt, retry] = useRetry()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    // Medlemmarna behövs för namn och bild på varje lapp, som i chatten.
    Promise.all([getGroupPosts(groupId), getGroupMembers(groupId)])
      .then(([list, people]) => {
        if (cancelled) return
        setPosts(list)
        setMembers(people)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [groupId, attempt])

  function stopWriting() {
    setWriting(false)
    setContent('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const text = content.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    try {
      const post = await createGroupPost(groupId, text)
      setPosts((current) => sortPosts([post, ...current]))
      stopWriting()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(post) {
    if (!(await confirm({ title: 'Ta ner lappen', text: 'Det går inte att ångra.', confirmLabel: 'Ta ner', danger: true })))
      return
    setError('')
    try {
      await deleteGroupPost(groupId, post.id)
      setPosts((current) => current.filter((item) => item.id !== post.id))
      setOpenPost(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePin(post) {
    setError('')
    try {
      const updated = await (post.pinned_at ? unpinGroupPost : pinGroupPost)(groupId, post.id)
      // Bara en fastnålad åt gången, så en annan fastnålad lapp tas loss.
      setPosts((current) =>
        sortPosts(
          current.map((item) => (item.id === updated.id ? updated : updated.pinned_at ? { ...item, pinned_at: null } : item)),
        ),
      )
      setOpenPost(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  function authorOf(post) {
    const author = members.find((person) => person.id === post.author_id)
    return { author, name: author ? (author.name ?? author.username) : 'Tidigare medlem' }
  }

  const titleId = `board-${groupId}`
  const open = openPost && authorOf(openPost)
  const canRemove = openPost && (isOwner || (openPost.author_id === user?.id && !openPost.pinned_at))
  // Andras lappar går att anmäla (se ReportButton).
  const reportable = openPost && openPost.author_id !== user?.id && open.author
  // Skrivlappen hamnar efter den fastnålade, som alltid ligger först.
  const pinnedCount = posts.filter((post) => post.pinned_at).length

  function renderNote(post) {
    const { author, name } = authorOf(post)
    return (
      <button
        key={post.id}
        type="button"
        className={`paper-note board-note${post.pinned_at ? ' is-pinned' : ''}`}
        onClick={() => setOpenPost(post)}
      >
        {post.pinned_at && <span className="board-note-pinned">Fastnålad</span>}
        <span className="board-note-text">{post.content}</span>
        <span className="board-note-meta">
          <Avatar name={name} imageUrl={author?.image_url} className="person-list-avatar" />
          {post.author_id === user?.id ? 'Du' : name}, {formatSentAt(post.created_at)}
        </span>
      </button>
    )
  }

  return (
    <section className={`board${full ? ' board-full' : ''}`} aria-labelledby={titleId}>
      <div className="board-head">
        <h2 id={titleId} className="board-title">
          Anslagstavla
        </h2>
        <div className="board-actions">
          {!full && posts.length > SHOWN_ON_DESKTOP && (
            <button type="button" className="secondary-button button-small board-show-all" onClick={() => setShowAll((all) => !all)}>
              {showAll ? 'Visa färre' : `Visa alla (${posts.length})`}
            </button>
          )}
          {!writing && (
            <button type="button" className="primary-button button-small" onClick={() => setWriting(true)}>
              + Sätt upp en lapp
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="form-error board-error" role="alert">
          {error}
        </p>
      )}
      {status === 'loading' && <p className="board-empty">Laddar lappar...</p>}
      {status === 'error' && <LoadError text="Kunde inte hämta lapparna." onRetry={retry} className="board-empty" />}

      <div className={`board-notes${showAll ? ' is-all' : ''}`}>
        {posts.slice(0, pinnedCount).map(renderNote)}
        {writing && (
          <form className="paper-note board-note board-note-new" onSubmit={handleSubmit}>
            <label htmlFor={`board-new-${groupId}`} className="visually-hidden">
              Skriv en lapp
            </label>
            <textarea
              id={`board-new-${groupId}`}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={4}
              placeholder="Nyheter, regler eller något som ska synas..."
              autoFocus
            />
            <div className="board-note-actions">
              <button type="button" className="secondary-button button-small" onClick={stopWriting} disabled={sending}>
                Avbryt
              </button>
              <button type="submit" className="primary-button button-small" disabled={sending || !content.trim()}>
                {sending ? 'Sätter upp...' : 'Sätt upp'}
              </button>
            </div>
          </form>
        )}
        {posts.slice(pinnedCount).map(renderNote)}
      </div>
      {status === 'ready' && posts.length === 0 && !writing && (
        <p className="board-empty">Inga lappar än. Sätt upp den första!</p>
      )}

      {openPost && (
        <Modal title="Lapp" onClose={() => setOpenPost(null)}>
          <p className="board-note-full">{openPost.content}</p>
          <p className="board-note-from">
            <ChatSender
              userId={open.author?.id}
              mine={openPost.author_id === user?.id}
              name={open.name}
              imageUrl={open.author?.image_url}
            />{' '}
            <time className="hint-text" dateTime={openPost.created_at}>
              {formatSentAt(openPost.created_at)}
            </time>
          </p>
          {(canRemove || reportable) && (
            <div className="board-note-buttons">
              {isOwner && (
                <button type="button" className="secondary-button button-small" onClick={() => handlePin(openPost)}>
                  {openPost.pinned_at ? 'Ta loss nålen' : 'Nåla fast'}
                </button>
              )}
              {canRemove && (
                <button type="button" className="secondary-button button-small" onClick={() => handleDelete(openPost)}>
                  Ta ner lappen
                </button>
              )}
              {reportable && (
                <ReportButton
                  targetType={REPORT_TARGET.groupPost}
                  targetId={openPost.id}
                  userId={open.author.id}
                  name={open.name}
                  quote={openPost.content}
                />
              )}
            </div>
          )}
        </Modal>
      )}
    </section>
  )
}

export default GroupPosts
