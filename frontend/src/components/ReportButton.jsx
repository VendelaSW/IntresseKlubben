import { useState } from 'react'
import { blockQuestion, blockUser } from '../services/contacts'
import { REPORT_REASONS, sendReport } from '../services/reports'
import Modal from './Modal'
import TextareaWithCount from './TextareaWithCount'

// Samma gräns som i backend (schemas/report.py).
const MAX_COMMENT = 500

// Knappen "Anmäl" och rutan den öppnar: man väljer en anledning, kan skriva en
// kommentar och skickar (POST /reports). Efteråt kommer en bekräftelse med
// "Blockera <namn> också". Används på profiler, vid brev och meddelanden i
// klubbchatten och i popupen för en lapp på anslagstavlan.
// `targetType` och `targetId` säger vad som anmäls (se services/reports.js),
// `userId` och `name` vem. `quote` är texten som anmäls, så att man ser den i
// rutan. `onBlocked` anropas om man blockerar personen härifrån. `className`
// styr knappens utseende (t.ex. text-button eller report-link i chatten).
function ReportButton({ targetType, targetId, userId, name, quote, onBlocked, className = 'text-button', label }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setOpen(false)
    setReason('')
    setComment('')
    setSent(false)
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!reason) {
      setError('Välj en anledning.')
      return
    }
    setSending(true)
    setError('')
    try {
      await sendReport({ targetType, targetId, reason, comment })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleBlock() {
    if (!window.confirm(blockQuestion(name))) return
    setError('')
    try {
      await blockUser(userId)
      setBlocked(true)
      onBlocked?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={label}>
        Anmäl
      </button>
      {open && (
        <Modal title={sent ? 'Tack för din anmälan' : `Anmäl ${name}`} onClose={close}>
          {sent ? (
            <div className="report-done">
              <p>Vi har tagit emot den och tittar på den. {name} får inte veta vem som anmälde.</p>
              {blocked ? (
                <p className="hint-text">Du har blockerat {name}.</p>
              ) : (
                <button type="button" className="secondary-button button-small" onClick={handleBlock}>
                  Blockera {name} också
                </button>
              )}
              {error && <p className="form-error">{error}</p>}
            </div>
          ) : (
            <form className="auth-form form-compact report-form" onSubmit={handleSubmit}>
              {quote && <blockquote className="report-quote">{quote}</blockquote>}
              <fieldset className="report-reasons">
                <legend>Vad har hänt?</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r.value}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => {
                        setReason(r.value)
                        setError('')
                      }}
                    />{' '}
                    {r.label}
                  </label>
                ))}
              </fieldset>
              <label htmlFor={`report-comment-${targetType}-${targetId}`}>Kommentar (valfritt)</label>
              <TextareaWithCount
                id={`report-comment-${targetType}-${targetId}`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={MAX_COMMENT}
                rows={3}
                placeholder="Berätta gärna vad som hände"
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button type="submit" disabled={sending}>
                  {sending ? 'Skickar...' : 'Skicka anmälan'}
                </button>
                <button type="button" className="button-secondary" onClick={close} disabled={sending}>
                  Avbryt
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}

export default ReportButton
