import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import FilterTabs from '../components/FilterTabs'
import Modal from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import { useTabParam } from '../hooks/useTabParam'
import {
  SUSPENSION_LENGTHS,
  liftSuspension,
  moderationReportsQuery,
  setReportHandled,
  suggestedDays,
  suspendUser,
} from '../services/moderation'
import { REPORT_REASONS } from '../services/reports'
import { formatSentAt } from '../utils/formatSentAt'
import { useConfirm } from '../hooks/useConfirm'

const TABS = [
  { id: 'new', label: 'Nya' },
  { id: 'handled', label: 'Hanterade' },
]

const WHERE = {
  profile: 'Profil',
  message: 'Brev',
  group_message: 'Klubbchatt',
  group_post: 'Lapp',
}

const reasonLabel = (value) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value
const day = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })

// "till 28 okt." eller "tills vidare".
function untilText(suspension) {
  return suspension.until ? `till ${day.format(new Date(suspension.until))}` : 'tills vidare'
}

function timesText(count) {
  return count === 1 ? '1 gång' : `${count} gånger`
}

// Moderering (block på kartan, bara för moderatorer, se MapProfileWidget):
// anmälningarna från SCRUM-130 under Nya och Hanterade. Varje kort visar vem
// som anmäldes och av vem, var, varför och en kopia av texten, plus hur många
// gånger personen har anmälts och om hen är eller har varit avstängd. Härifrån
// markeras anmälan som hanterad och personen kan stängas av (SuspendDialog).
// Servern släpper bara in moderatorer (routes/moderation.py).
function ModerationPage() {
  const confirm = useConfirm()
  const { user } = useAuth()
  const [urlTab, setTab] = useTabParam(TABS)
  const tab = urlTab ?? 'new'
  const enabled = Boolean(user?.is_moderator)
  const newReports = useQuery({ ...moderationReportsQuery(false), enabled })
  const handledReports = useQuery({ ...moderationReportsQuery(true), enabled })
  const [suspending, setSuspending] = useState(null) // anmälan vars person ska stängas av
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!enabled) return <p className="status-error">Bara moderatorer kommer åt den här sidan.</p>

  const lists = { new: newReports, handled: handledReports }
  const current = lists[tab]

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLift(person) {
    if (!(await confirm({ title: 'Häv avstängningen', text: `Häv avstängningen för ${person.name}?`, confirmLabel: 'Häv' })))
      return
    run(() => liftSuspension(person.id))
  }

  return (
    <section className="app-section">
      <h1 className="app-title">Moderering</h1>
      <FilterTabs tabs={TABS.map((t) => ({ ...t, count: lists[t.id].data?.length }))} active={tab} onChange={setTab} />
      {error && (
        <p className="status-error" role="alert">
          {error}
        </p>
      )}

      {current.isError ? (
        <p className="status-error">Kunde inte hämta anmälningarna. Försök igen senare.</p>
      ) : !current.data ? (
        <p className="hint-text">Laddar...</p>
      ) : current.data.length === 0 ? (
        <p className="hint-text">{tab === 'new' ? 'Inga nya anmälningar.' : 'Inga hanterade anmälningar än.'}</p>
      ) : (
        <ul className="moderation-list">
          {current.data.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              busy={busy}
              onHandled={(handled) => run(() => setReportHandled(report.id, handled))}
              onSuspend={() => setSuspending(report)}
              onLift={() => handleLift(report.reported)}
            />
          ))}
        </ul>
      )}

      {suspending && (
        <SuspendDialog
          person={suspending.reported}
          defaultReason={suspending.reason}
          onClose={() => setSuspending(null)}
        />
      )}
    </section>
  )
}

function ReportCard({ report, busy, onHandled, onSuspend, onLift }) {
  const { reported, reporter } = report
  const previous = reported?.previous_suspensions.length ?? 0
  const where = [WHERE[report.target_type], report.group_name].filter(Boolean).join(' i ')
  return (
    <li className="card moderation-card">
      <div className="moderation-card-head">
        <p className="moderation-who">
          {reported ? (
            <Link to={`/anvandare/${reported.id}`} className="info-link">
              {reported.name}
            </Link>
          ) : (
            <em>Raderat konto</em>
          )}{' '}
          anmäld av{' '}
          {reporter ? (
            <Link to={`/anvandare/${reporter.id}`} className="info-link">
              {reporter.name}
            </Link>
          ) : (
            <em>raderat konto</em>
          )}
        </p>
        <span className="status-pill status-pill-error">{reasonLabel(report.reason)}</span>
      </div>
      <p className="hint-text moderation-meta">
        {where}, {formatSentAt(report.created_at)}.
        {reported && ` Anmäld ${timesText(reported.report_count)} totalt.`}
      </p>
      {reported?.suspension && (
        <p className="moderation-status">Avstängd {untilText(reported.suspension)}</p>
      )}
      {previous > 0 && <p className="hint-text">Har varit avstängd {timesText(previous)} tidigare.</p>}
      {report.content && <blockquote className="report-quote">{report.content}</blockquote>}
      {report.comment && <p className="moderation-comment">Kommentar: {report.comment}</p>}
      {report.handled_at && (
        <p className="hint-text">
          Hanterad {formatSentAt(report.handled_at)}
          {report.handled_by && ` av ${report.handled_by}`}
        </p>
      )}
      <div className="card-actions">
        {report.handled_at ? (
          <button type="button" className="secondary-button button-small" disabled={busy} onClick={() => onHandled(false)}>
            Flytta tillbaka till Nya
          </button>
        ) : (
          <button type="button" className="primary-button button-small" disabled={busy} onClick={() => onHandled(true)}>
            Markera som hanterad
          </button>
        )}
        {reported &&
          (reported.suspension ? (
            <button type="button" className="secondary-button button-small" disabled={busy} onClick={onLift}>
              Häv avstängningen
            </button>
          ) : (
            <button type="button" className="secondary-button button-small" disabled={busy} onClick={onSuspend}>
              Stäng av {reported.name}
            </button>
          ))}
      </div>
    </li>
  )
}

// Rutan "Stäng av …": hur länge och varför. Förvalt är nästa steg efter hur många
// gånger personen har varit avstängd förut (suggestedDays), med en påminnelse om
// historiken, och anmälans anledning.
function SuspendDialog({ person, defaultReason, onClose }) {
  const previous = person.previous_suspensions
  const [days, setDays] = useState(suggestedDays(previous.length))
  const [reason, setReason] = useState(defaultReason)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const last = previous.at(-1)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await suspendUser(person.id, days, reason)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Stäng av ${person.name}`} onClose={onClose}>
      <form className="auth-form form-compact" onSubmit={handleSubmit}>
        {previous.length > 0 && (
          <p className="moderation-reminder">
            <strong>
              {person.name} har varit avstängd {timesText(previous.length)} tidigare
            </strong>{' '}
            (senast {day.format(new Date(last.starts_at))}, {reasonLabel(last.reason).toLowerCase()}). Nästa steg brukar
            vara {previous.length === 1 ? '30 dagar eller tills vidare' : 'tills vidare'}.
          </p>
        )}
        <p className="hint-text">
          {person.name} har anmälts {timesText(person.report_count)} totalt. {person.name} loggas ut och kan inte logga
          in förrän avstängningen är slut eller hävs.
        </p>
        <fieldset className="report-reasons">
          <legend>Hur länge?</legend>
          {SUSPENSION_LENGTHS.map((length) => (
            <label key={length.label}>
              <input type="radio" name="suspension-days" checked={days === length.days} onChange={() => setDays(length.days)} />{' '}
              {length.label}
            </label>
          ))}
        </fieldset>
        <label htmlFor="suspension-reason">Varför?</label>
        <select id="suspension-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Stänger av...' : `Stäng av ${person.name}`}
          </button>
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ModerationPage
