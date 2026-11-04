import { useEffect, useState } from 'react'
import Modal from '../Modal'
import TextareaWithCount from '../TextareaWithCount'
import { EVENT_ANSWER, deleteEvent, getEventResponses } from '../../services/events'

// Rutan "Radera eventet": i redigeringsläget (för skaparen) och i eventets vy (för klubbens ägare, som får radera men
// inte redigera andras event, SCRUM-326). Man kan skriva ett meddelande till dem som har svarat Ja eller Kanske (de får
// en notis från Intresseklubben). Tar klubbens ägare bort någon annans event får skaparen också en notis. Svaren hämtas
// här, så att rutan kan säga vilka som får en notis. `onDeleted` anropas när eventet är raderat.
function DeleteEventDialog({ event, onClose, onDeleted }) {
  const [responses, setResponses] = useState(null) // null = laddar
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getEventResponses(event.id)
      .then(setResponses)
      .catch(() => setFailed(true))
  }, [event.id])

  // De som har svarat Ja eller Kanske (utom skaparen) får en notis när eventet ställs in, med meddelandet om det finns.
  const coming = (responses ?? []).filter(
    (r) => r.id !== event.creator_id && (r.answer === EVENT_ANSWER.yes || r.answer === EVENT_ANSWER.maybe),
  ).length
  const creatorName = event.creator_name ?? event.creator_username
  // Klubbens ägare och ingen som ska komma: bara skaparen får meddelandet.
  const recipient = !event.is_owner && responses !== null && coming === 0 ? creatorName : 'dem'

  async function handleDelete(submitEvent) {
    submitEvent.preventDefault()
    setDeleting(true)
    setError('')
    try {
      await deleteEvent(event.id, message)
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <Modal title="Radera eventet" onClose={onClose} locked={deleting}>
      <form className="auth-form form-compact" onSubmit={handleDelete}>
        <p className="card-text">«{event.title}» tas bort, med inbjudningar och svar. Det går inte att ångra.</p>
        {/* Medan svaren laddas sägs inget om vilka som får en notis. Gick de inte att hämta vet vi inte, men backend
            skickar notiserna ändå, så meddelandefältet visas. */}
        {responses === null && !failed && <p className="hint-text">Hämtar vilka som har svarat...</p>}
        {failed && (
          <p className="hint-text">
            Kunde inte hämta vilka som har svarat. De som har svarat Ja eller Kanske får ändå en notis från
            Intresseklubben om att eventet är inställt.
          </p>
        )}
        {responses !== null && coming > 0 && (
          <p className="hint-text">
            {coming === 1 ? '1 medlem har' : `${coming} medlemmar har`} svarat Ja eller Kanske och får en notis från
            Intresseklubben om att eventet är inställt.
          </p>
        )}
        {responses !== null && coming === 0 && event.is_owner && (
          <p className="hint-text">Ingen har svarat Ja eller Kanske, så ingen får någon notis.</p>
        )}
        {/* Klubbens ägare tar bort någon annans event: skaparen får också veta det. */}
        {!event.is_owner && (
          <p className="hint-text">{creatorName}, som skapade eventet, får en notis om att du har tagit bort det.</p>
        )}
        {(failed || coming > 0 || !event.is_owner) && (
          <>
            <label htmlFor={`cancel-message-${event.id}`}>Meddelande till {recipient} (valfritt)</label>
            <TextareaWithCount
              id={`cancel-message-${event.id}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="T.ex. Inställt pga sjukdom, vi ses nästa vecka!"
            />
          </>
        )}
        {error && <p className="status-error">{error}</p>}
        {/* Det säkra valet är den gula knappen, raderingen har en egen röd stil (.button-danger). */}
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={deleting}>
            Behåll eventet
          </button>
          <button type="submit" className="button-danger" disabled={deleting || (responses === null && !failed)}>
            {deleting ? 'Raderar...' : 'Radera eventet'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default DeleteEventDialog
