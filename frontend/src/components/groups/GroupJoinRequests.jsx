import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import LoadError, { useRetry } from '../LoadError'
import Modal from '../Modal'
import { approveJoinRequest, declineJoinRequest, getJoinRequests } from '../../services/groups'
import InfoTip from '../InfoTip'
import { notificationsChanged } from '../../services/notifications'

// Ansökningarna till en klubb man äger (SCRUM-159), i klubbens vy: namn (länk till
// profilen), meddelandet och Godkänn eller Neka. Utan ansökningar syns ingenting. Neka frågar efter en valfri
// förklaring. Den som ansökt får en notis med svaret (och förklaringen), och kan
// ansöka igen efter ett nej. `onChanged` anropas när någon
// har godkänts (klubben har då en medlem till) eller nekats.
// Används också för events (SCRUM-296): `group` är då eventet ({ id, request_count }),
// och `load`, `approve` och `decline` eventets anrop (se services/events.js).
// `full` (klubben eller eventet är fullt): Godkänn går inte att trycka på, och `fullText` säger varför och vad man
// kan göra. Antalet står i rubriken, och ett svar räknar notisen om ansökan som läst (se notificationsChanged).
function GroupJoinRequests({
  group,
  onChanged,
  load = getJoinRequests,
  approve = approveJoinRequest,
  decline = declineJoinRequest,
  declinePlaceholder = 'T.ex. att klubben är full till hösten',
  full = false,
  fullText = 'Klubben är full. Neka, eller höj maxantalet för att kunna godkänna fler.',
}) {
  const [requests, setRequests] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  // Ansökan som ska nekas (rutan med förklaringen är öppen), och förklaringen.
  const [declining, setDeclining] = useState(null)
  const [reason, setReason] = useState('')
  const [attempt, retry] = useRetry()

  useEffect(() => {
    setFailed(false)
    load(group.id)
      .then(setRequests)
      .catch(() => setFailed(true))
  }, [group.id, group.request_count, attempt])

  // Ger om det gick, så att rutan för att neka kan stängas.
  async function answer(userId, action, ...args) {
    setBusyId(userId)
    setError('')
    try {
      await action(group.id, userId, ...args)
      setRequests((list) => list.filter((r) => r.user.id !== userId))
      notificationsChanged()
      onChanged?.()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(event) {
    event.preventDefault()
    if (await answer(declining.id, decline, reason.trim())) {
      setDeclining(null)
      setReason('')
    }
  }

  // Inga ansökningar, eller medan de laddas: ingenting alls, inte ens rubriken. Gick de inte att hämta visas felet.
  if (!failed && !requests?.length) return null

  return (
    <div className="person-list person-list-compact group-requests">
      <p className="card-subheading">Ansökningar{requests?.length > 0 && ` (${requests.length})`}</p>
      {full && requests?.length > 0 && <p className="hint-text group-requests-full">{fullText}</p>}
      {failed ? (
        <LoadError text="Kunde inte hämta ansökningarna." onRetry={retry} className="hint-text" />
      ) : (
        <ul>
          {requests.map(({ user, message }) => (
            <li key={user.id} className="group-request">
              <Link to={`/anvandare/${user.id}`} className="person-list-item">
                <Avatar name={user.name ?? user.username} imageUrl={user.image_url} className="person-list-avatar" />
                <span>{user.name ?? user.username}</span>
              </Link>
              {message && <p className="group-request-message">”{message}”</p>}
              <div className="card-actions">
                <button
                  type="button"
                  className="primary-button button-small"
                  disabled={busyId !== null || full}
                  title={full ? fullText : undefined}
                  onClick={() => answer(user.id, approve)}
                >
                  Godkänn
                </button>
                <button
                  type="button"
                  className="secondary-button button-small"
                  disabled={busyId !== null}
                  onClick={() => {
                    setError('')
                    setReason('')
                    setDeclining(user)
                  }}
                >
                  Neka
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && !declining && <p className="status-error">{error}</p>}
      {declining && (
        <Modal title={`Neka ${declining.name ?? declining.username}`} onClose={() => setDeclining(null)}>
          <form className="auth-form" onSubmit={handleDecline}>
            <div className="with-info-tip">
              <label htmlFor="decline-reason">Varför? (valfritt)</label>
              <InfoTip text="Det du skriver följer med i notisen. Hen kan ansöka igen senare." />
            </div>
            <textarea
              id="decline-reason"
              rows={3}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={declinePlaceholder}
            />
            {error && <p className="status-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" disabled={busyId !== null}>
                {busyId !== null ? 'Nekar...' : 'Neka ansökan'}
              </button>
              <button type="button" className="button-secondary" onClick={() => setDeclining(null)}>
                Avbryt
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default GroupJoinRequests
