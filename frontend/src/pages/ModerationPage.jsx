import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import FilterTabs from '../components/FilterTabs'
import Modal from '../components/Modal'
import TextareaWithCount from '../components/TextareaWithCount'
import { useAuth } from '../hooks/useAuth'
import { useTabParam } from '../hooks/useTabParam'
import {
  SUSPENSION_LENGTHS,
  liftSuspension,
  moderationReportsQuery,
  setReportHandled,
  suggestedDays,
  suspendUser,
  warnUser,
} from '../services/moderation'
import { REPORT_REASONS } from '../services/reports'
import { formatSentAt } from '../utils/formatSentAt'
import { useConfirm } from '../hooks/useConfirm'
import LoadError from '../components/LoadError'

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

// Personens tidigare varningar (SCRUM-268) och avstängningar i en mening:
// "fått 2 varningar och varit avstängd 1 gång". Tom text om det inte finns några.
function historyText(warningCount, suspensionCount) {
  return [
    warningCount > 0 && `fått ${warningCount === 1 ? '1 varning' : `${warningCount} varningar`}`,
    suspensionCount > 0 && `varit avstängd ${timesText(suspensionCount)}`,
  ]
    .filter(Boolean)
    .join(' och ')
}

// "senast 12 okt., spam eller bedrägeri" för den senaste varningen eller avstängningen.
function latestText(item, at) {
  return `senast ${day.format(new Date(at))}, ${reasonLabel(item.reason).toLowerCase()}`
}

// Moderering (block på kartan, bara för moderatorer, se MapProfileWidget):
// anmälningarna från SCRUM-130 under Nya och Hanterade. Varje kort visar vem
// som anmäldes och av vem, var, varför och en kopia av texten, plus hur många
// gånger personen har anmälts, har varnats och om hen är eller har varit avstängd.
// Härifrån markeras anmälan som hanterad, personen kan varnas (WarnDialog,
// SCRUM-268) och stängas av (SuspendDialog).
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
  const [warning, setWarning] = useState(null) // anmälan vars person ska varnas
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
        <LoadError text="Kunde inte hämta anmälningarna." onRetry={() => current.refetch()} retrying={current.isFetching} />
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
              onWarn={() => setWarning(report)}
              onSuspend={() => setSuspending(report)}
              onLift={() => handleLift(report.reported)}
            />
          ))}
        </ul>
      )}

      {warning && <WarnDialog report={warning} onClose={() => setWarning(null)} />}

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

function ReportCard({ report, busy, onHandled, onWarn, onSuspend, onLift }) {
  const { reported, reporter } = report
  const history = reported ? historyText(reported.warnings.length, reported.previous_suspensions.length) : ''
  const lastWarning = reported?.warnings.at(-1)
  // En anmälan ger högst en varning (backend säger nej till en till).
  const warned = reported?.warnings.some((w) => w.report_id === report.id)
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
      {history && (
        <p className="hint-text">
          Har {history} tidigare.
          {lastWarning && ` Varnad ${latestText(lastWarning, lastWarning.created_at)}.`}
        </p>
      )}
      {report.content && <blockquote className="report-quote">{report.content}</blockquote>}
      {report.comment && <p className="moderation-comment">Kommentar: {report.comment}</p>}
      {report.handled_at && (
        <p className="hint-text">
          {warned ? 'Varnad' : 'Hanterad'} {formatSentAt(report.handled_at)}
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
            <>
              {/* Utan namnet i texten, så att knapparna får plats på mobil även med ett långt namn
                  (det står överst på kortet). Skärmläsare får namnet med aria-label. */}
              {!warned && (
                <button
                  type="button"
                  className="secondary-button button-small"
                  disabled={busy}
                  onClick={onWarn}
                  aria-label={`Varna ${reported.name}`}
                >
                  Varna
                </button>
              )}
              <button
                type="button"
                className="secondary-button button-small"
                disabled={busy}
                onClick={onSuspend}
                aria-label={`Stäng av ${reported.name}`}
              >
                Stäng av
              </button>
            </>
          ))}
      </div>
    </li>
  )
}

// Rutan "Varna …" (SCRUM-268): vilken regel som bröts (förvalt anmälans anledning)
// och ett valfritt meddelande. Personen får en notis, och anmälan blir hanterad.
function WarnDialog({ report, onClose }) {
  const person = report.reported
  const [reason, setReason] = useState(report.reason)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await warnUser(report.id, reason, message)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Varna ${person.name}`} onClose={onClose} locked={saving}>
      <form className="auth-form form-compact" onSubmit={handleSubmit}>
        <p className="hint-text">
          {person.name} får en notis om vilken regel som bröts, med ditt meddelande om du skriver ett. Anmälan markeras
          som hanterad.
        </p>
        <label htmlFor="warning-reason">Vilken regel bröts?</label>
        <select id="warning-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label htmlFor="warning-message">Meddelande till {person.name} (valfritt)</label>
        <TextareaWithCount
          id="warning-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="T.ex. Håll en vänlig ton i klubbchatten."
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Skickar...' : 'Skicka varningen'}
          </button>
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Rutan "Stäng av …": hur länge och varför. Förvalt är nästa steg efter hur många
// gånger personen har varit avstängd förut och om hen har fått varningar
// (suggestedDays), med en påminnelse om historiken, och anmälans anledning.
function SuspendDialog({ person, defaultReason, onClose }) {
  const previous = person.previous_suspensions
  const warnings = person.warnings
  const [days, setDays] = useState(suggestedDays(previous.length, warnings.length))
  const [reason, setReason] = useState(defaultReason)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const last = previous.at(-1)
  const lastWarning = warnings.at(-1)
  const history = historyText(warnings.length, previous.length)
  const latest = [
    lastWarning && `varning ${latestText(lastWarning, lastWarning.created_at)}`,
    last && `avstängd ${latestText(last, last.starts_at)}`,
  ]
    .filter(Boolean)
    .join('; ')
  const nextStep =
    previous.length === 0 ? '7 dagar' : previous.length === 1 ? '30 dagar eller tills vidare' : 'tills vidare'

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
        {history && (
          <p className="moderation-reminder">
            <strong>
              {person.name} har {history} tidigare
            </strong>{' '}
            ({latest}). Nästa steg brukar vara {nextStep}.
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
