import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import eventIcon from '../assets/event.png'
import logo from '../assets/intresseklubben.png'
import klubbarIcon from '../assets/klubbar.png'
import notiserIcon from '../assets/notiser.svg'
import Avatar from '../components/Avatar'
import BackButton from '../components/BackButton'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import Modal from '../components/Modal'
import { PadHeadAction } from '../components/PadHead'
import { useGoBack } from '../hooks/useCanGoBack'
import {
  deleteAllNotifications,
  deleteNotification,
  markNotificationRead,
  markNotificationsRead,
  notificationsQuery,
} from '../services/notifications'
import { formatSentAt } from '../utils/formatSentAt'

// Notiser från Intresseklubben (lappen Notiser på kartan): en rad per notis, nyaste först, uppdelade i Idag och
// Tidigare. En oläst har en gul prick och gul bakgrund, och krysset tar bort en. Raden går direkt till det notisen
// gäller (eventet, klubben ...) och räknas då som läst. Har den inget ställe att gå till (ett inställt event, en varning) öppnar raden
// notisen (/notiser?notis=ID) med hela texten och citatet. Notiserna är allmänna och skrivs i backend (se
// crud/notification.py), så en ny sorts notis behöver inget här; bilden avgörs av personen eller `kind`.
function NotificationsPage() {
  const { data: notifications = [], isSuccess, isError, refetch, isFetching } = useQuery(notificationsQuery)
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = Number(searchParams.get('notis')) || null
  const goBack = useGoBack(() => setSearchParams({}, { replace: true }))
  const navigate = useNavigate()
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

  if (isError) return <LoadError text="Kunde inte hämta notiserna." onRetry={() => refetch()} retrying={isFetching} />
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

  function openNotification(n) {
    if (n.link) {
      // Misslyckas det står den kvar som ny, och nästa gång försöker den igen.
      if (!n.read) markNotificationRead(n.id).catch(() => {})
      navigate(n.link)
    } else {
      setSearchParams({ notis: String(n.id) })
    }
  }

  const unread = notifications.filter((n) => !n.read).length
  const today = notifications.filter((n) => isToday(n.created_at))
  const earlier = notifications.filter((n) => !isToday(n.created_at))
  return (
    <section className="app-section notification-page">
      <h1 className="app-title notification-heading">Notiser</h1>
      {notifications.length > 0 && (
        // I blockets rubrikrad bredvid rubriken, när blocket har en sådan (se PadHead).
        <PadHeadAction>
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
            <span className="notification-actions-divider" aria-hidden="true" />
            <button type="button" className="text-button" onClick={() => setClearOpen(true)}>
              Ta bort alla
            </button>
          </div>
        </PadHeadAction>
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
        <NotificationsEmpty />
      ) : (
        [
          ['Idag', today],
          ['Tidigare', earlier],
        ].map(
          ([title, group]) =>
            group.length > 0 && (
              <div key={title} className="notification-group">
                <h2 className="notification-group-title">{title}</h2>
                <ul className="notification-list">
                  {group.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      onOpen={() => openNotification(n)}
                      onRemove={() => run(() => deleteNotification(n.id))}
                    />
                  ))}
                </ul>
              </div>
            ),
        )
      )}
    </section>
  )
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

function isToday(value) {
  return startOfDay(new Date(value)) >= startOfDay(new Date())
}

// Tiden till höger på raden: klockslaget i dag, "Igår" och sedan datumet ("3 nov.").
const dayAndMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })
function rowTime(value) {
  if (isToday(value)) return formatSentAt(value)
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / 86400000)
  return daysAgo === 1 ? 'Igår' : dayAndMonth.format(new Date(value))
}

// Bilden till vänster på raden: personen notisen gäller (profilbilden eller initialen), annars en symbol för
// sorten. Ett inställt event och en borttagen klubb har sin symbol med ett rött kryss, en varning ett rött utropstecken (moderatorn
// visas aldrig) och brev från utvecklarna Intresseklubbens loggan.
export function NotificationImage({ notification: n }) {
  if (n.actor) {
    return <Avatar name={n.actor.name} imageUrl={n.actor.profile_image_url} className="notification-image" />
  }
  if (n.kind === 'moderation_warning') {
    return (
      <span className="notification-image is-warning" aria-hidden="true">
        !
      </span>
    )
  }
  const symbol = n.kind.startsWith('event_')
    ? eventIcon
    : n.kind.startsWith('group_')
      ? klubbarIcon
      : n.kind === 'news'
        ? logo
        : notiserIcon
  return (
    <span className="notification-image is-symbol" aria-hidden="true">
      <img src={symbol} alt="" />
      {(n.kind === 'event_cancelled' || n.kind === 'group_deleted') && <span className="notification-image-cross">×</span>}
    </span>
  )
}

// Raden under rubriken: citatet om det finns (någons egna ord), annars texten.
function subtitle(n) {
  return n.quote ? `”${n.quote}”` : n.body
}

// En rad i listan: prick (oläst), bilden, rubriken med en rad under, tiden och en pil (allt det är knappen som
// öppnar), och längst till höger krysset som tar bort den. Exporterad för stilguiden.
export function NotificationRow({ notification: n, onOpen, onRemove }) {
  return (
    <li className={`notification${n.read ? '' : ' is-unread'}`}>
      <button type="button" className="notification-open" onClick={onOpen}>
        <span className="notification-dot" aria-label={n.read ? undefined : 'Ny'} />
        <NotificationImage notification={n} />
        <span className="notification-text">
          <span className="notification-title">{n.title}</span>
          {subtitle(n) && <span className="notification-subtitle">{subtitle(n)}</span>}
        </span>
        <time className="notification-time" dateTime={n.created_at}>
          {rowTime(n.created_at)}
        </time>
        <span className="notification-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <button
        type="button"
        className="notification-remove"
        aria-label={`Ta bort notisen ${n.title}`}
        title="Ta bort"
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  )
}

// En öppnad notis (en utan ställe att gå till): hela texten och citatet. Räknas som läst när den visas.
// Exporterad för stilguiden.
export function NotificationDetails({ notification: n, onRemove }) {
  useEffect(() => {
    // Misslyckas det står den kvar som ny, och nästa gång man öppnar den försöker den igen.
    if (!n.read) markNotificationRead(n.id).catch(() => {})
  }, [n.id, n.read])

  return (
    <article className="notification-details">
      <NotificationImage notification={n} />
      <div className="notification-details-body">
        <p className="notification-meta">
          Från Intresseklubben, <time dateTime={n.created_at}>{formatSentAt(n.created_at)}</time>
        </p>
        <h2 className="notification-details-title">{n.title}</h2>
        {n.body && <p className="card-text">{n.body}</p>}
        {n.quote && (
          <blockquote className="notification-quote">
            ”{n.quote}”{n.quote_by && <span className="hint-text"> – {n.quote_by}</span>}
          </blockquote>
        )}
        <button type="button" className="text-button notification-details-remove" onClick={onRemove}>
          Ta bort
        </button>
      </div>
    </article>
  )
}

// Exempel på vad som kan dyka upp, som bleka rader under kompisen när det inte finns några notiser, så att sidan
// visar vad den är till för i stället för att se tom ut.
const EXAMPLES = [
  { id: 1, kind: 'event_cancelled', title: 'Eventet ”Kvällspromenaden” har ställts in' },
  { id: 2, kind: 'event_join_request', title: 'Någon vill vara med på ditt event' },
  { id: 3, kind: 'group_request_approved', title: 'Du är med i klubben!' },
]

// Tomt läge: kompisen berättar att det är tomt, med exemplen under. Exporterad för stilguiden.
export function NotificationsEmpty() {
  return (
    <>
      <EmptyState
        title="Inga notiser än"
        text="Här får du besked från Intresseklubben om dina events och klubbar, till exempel:"
      />
      <ul className="notification-examples" aria-label="Exempel på notiser">
        {EXAMPLES.map((example) => (
          <li key={example.id} className="notification-example">
            <NotificationImage notification={example} />
            <span className="notification-title">{example.title}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export default NotificationsPage
