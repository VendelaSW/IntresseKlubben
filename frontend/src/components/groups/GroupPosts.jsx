import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { createGroupPost, deleteGroupPost, getGroupMembers, getGroupPosts } from '../../services/groups'
import { formatSentAt } from '../../utils/formatSentAt'
import ChatSender from '../ChatSender'
import TextareaWithCount from '../TextareaWithCount'

// Samma gräns som i backend (schemas/group_post.py).
const MAX_LENGTH = 2000

// Klubbens inlägg (nyheter, regler), under klubbens ruta (se GroupsPanel). Till
// skillnad från chatten ligger de kvar, nyaste först, tills den som skrev
// inlägget eller klubbens ägare raderar dem. Bara för medlemmar, och servern
// kontrollerar medlemskapet. `isOwner`: man äger klubben och får radera alla.
function GroupPosts({ groupId, isOwner }) {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    // Medlemmarna behövs för namn och bild vid varje inlägg, som i chatten.
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
  }, [groupId])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = content.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    try {
      const post = await createGroupPost(groupId, text)
      setPosts((current) => [post, ...current])
      setContent('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(post) {
    if (!window.confirm('Radera inlägget? Det går inte att ångra.')) return
    setError('')
    try {
      await deleteGroupPost(groupId, post.id)
      setPosts((current) => current.filter((item) => item.id !== post.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const titleId = `group-posts-${groupId}`

  return (
    <section className="card sheet group-posts" aria-labelledby={titleId}>
      <h2 id={titleId} className="card-subheading">
        Inlägg
      </h2>
      {/* Samma fält som i de andra formulären för att skapa något (.form-compact). */}
      <form className="auth-form form-wide form-compact group-post-form" onSubmit={handleSubmit}>
        <label htmlFor={`group-post-${groupId}`} className="visually-hidden">
          Skriv ett inlägg
        </label>
        <TextareaWithCount
          id={`group-post-${groupId}`}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder="Nyheter, regler eller annat som ska ligga kvar..."
        />
        <button type="submit" className="primary-button button-small" disabled={sending || !content.trim()}>
          {sending ? 'Publicerar...' : 'Publicera'}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {status === 'loading' && <p className="hint-text">Laddar inlägg...</p>}
      {status === 'error' && <p className="status-error">Kunde inte hämta inläggen. Försök igen senare.</p>}
      {status === 'ready' && posts.length === 0 && <p className="hint-text">Inga inlägg än.</p>}
      {posts.length > 0 && (
        <ul className="group-post-list">
          {posts.map((post) => {
            const mine = post.author_id === user?.id
            const author = members.find((person) => person.id === post.author_id)
            const name = author ? (author.name ?? author.username) : 'Tidigare medlem'
            return (
              <li key={post.id} className="group-post">
                <div className="group-post-head">
                  <ChatSender userId={author?.id} mine={mine} name={name} imageUrl={author?.image_url} />
                  <time className="hint-text" dateTime={post.created_at}>
                    {formatSentAt(post.created_at)}
                  </time>
                  {(mine || isOwner) && (
                    <button type="button" className="text-button group-post-delete" onClick={() => handleDelete(post)}>
                      Radera
                    </button>
                  )}
                </div>
                <p className="group-post-content">{post.content}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default GroupPosts
