import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import Modal from '../components/Modal'
import { useGoBack } from '../hooks/useCanGoBack'
import {
  deleteAllNotifications,
  deleteNotification,
  markNotificationRead,
  markNotificationsRead,
  notificationsQuery,
} from '../services/notifications'
import { formatSentAt } from '../utils/formatSentAt'

// Notiser från Intresseklubben (lappen Notiser på kartan), som en inkorg:
// listan visar en kompakt rad per notis, och olästa är markerade. Ett klick
// öppnar notisen (/notiser?notis=ID) med hela texten, citatet och länken, och
// först då räknas den som läst. Tillbaka går till listan, där den inte längre
// står som ny. Notiserna är allmänna (rubrik, text, citat, länk) och skrivs i
// backend (se crud/notification.py), så en ny sorts notis behöver inget här.
function NotificationsPage() {
  const { data: notifications = [], isSuccess, isError } = useQuery(notificationsQuery)
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = Number(searchParams.get('notis')) || null
  const goBack = useGoBack(() => setSearchParams({}, { replace: true }))
  const [error, setError] = useState('')
  // Rutan "Ta bort alla notiser?". En egen ruta i stället för webbläsarens
  // confirm(), som inte visas överallt (och då svarar nej av sig själv).
  const [clearOpen, setClearOpen] = useState(false)

  async function run(action) {
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    }
  }

  if (isError) return <p className="status-error">Kunde inte hämta notiserna. Försök igen senare.</p>
  if (!isSuccess) return <p className="hint-text">Laddar notiser...</p>

  if (openId) {
    const open = notifications.find((n) => n.id === openId)
    return (
      <section className="app-section">
        <BackButton onClick={goBack} />
        {open ? (
          <NotificationDetails
            notification={open}
            onRemove={() =>
              run(async () => {
                await deleteNotification(open.id)
                goBack()
              })
            }
          />
        ) : (
          <p className="hint-text">Notisen finns inte längre.</p>
        )}
        {error && <p className="status-error">{error}</p>}
      </section>
    )
  }

  const unread = notifications.filter((n) => !n.read).length
  return (
    <section className="app-section">
      <h1 className="app-title">Notiser</h1>
      {notifications.length > 0 && (
        <div className="notification-actions">
          {/* Står kvar när allt är läst, men ser då avstängd ut. */}
          <button
            type="button"
            className="text-button"
            disabled={unread === 0}
            onClick={() => run(markNotificationsRead)}
          >
            Markera alla som lästa
          </button>
          <button type="button" className="text-button" onClick={() => setClearOpen(true)}>
            Ta bort alla
          </button>
        </div>
      )}
      {clearOpen && (
        <Modal title="Ta bort alla notiser" onClose={() => setClearOpen(false)}>
          <div className="auth-form form-compact">
            <p className="card-text">
              {notifications.length === 1 ? 'Notisen tas bort.' : `Alla ${notifications.length} notiser tas bort.`} Det går
              inte att ångra.
            </p>
            <div className="form-actions">
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await deleteAllNotifications()
                    setClearOpen(false)
                  })
                }
              >
                Ta bort alla
              </button>
              <button type="button" className="button-secondary" onClick={() => setClearOpen(false)}>
                Behåll dem
              </button>
            </div>
          </div>
        </Modal>
      )}
      {error && <p className="status-error">{error}</p>}
      {notifications.length === 0 ? (
        <p className="hint-text">Inga notiser. Här hamnar besked från Intresseklubben, t.ex. om ett event du ska gå på ändras.</p>
      ) : (
        <ul className="notification-list">
          {notifications.map((n) => (
            <li key={n.id} className={`notification${n.read ? '' : ' is-unread'}`}>
              <button type="button" className="notification-open" onClick={() => setSearchParams({ notis: String(n.id) })}>
                {!n.read && <span className="notification-dot" aria-label="Ny" />}
                <span className="notification-title">{n.title}</span>
                <time className="notification-time" dateTime={n.created_at}>
                  {formatSentAt(n.created_at)}
                </time>
              </button>
              <button
                type="button"
                className="notification-remove"
                aria-label={`Ta bort notisen ${n.title}`}
                title="Ta bort"
                onClick={() => run(() => deleteNotification(n.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// En öppnad notis: hela texten, citatet och länken. Räknas som läst när den visas.
function NotificationDetails({ notification: n, onRemove }) {
  useEffect(() => {
    // Misslyckas det står den kvar som ny, och nästa gång man öppnar den försöker den igen.
    if (!n.read) markNotificationRead(n.id).catch(() => {})
  }, [n.id, n.read])

  return (
    <article className="card card-wide notification-details">
      <p className="notification-meta">
        Från Intresseklubben · <time dateTime={n.created_at}>{formatSentAt(n.created_at)}</time>
      </p>
      <h2 className="notification-details-title">{n.title}</h2>
      {n.body && <p className="card-text">{n.body}</p>}
      {n.quote && (
        <blockquote className="notification-quote">
          ”{n.quote}”{n.quote_by && <span className="hint-text"> – {n.quote_by}</span>}
        </blockquote>
      )}
      <div className="card-actions">
        {n.link && (
          <Link to={n.link} className="secondary-button button-small">
            Visa
          </Link>
        )}
        <button type="button" className="text-button" onClick={onRemove}>
          Ta bort
        </button>
      </div>
    </article>
  )
}

export default NotificationsPage
