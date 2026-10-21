import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { clearCache } from '../services/queryClient'
import { getDevAccounts, getDevScenarios, resetDevData, runDevScenario } from './api'
import { PHONE_URL } from './devMode'
import MobilePreview, { SIZES } from './MobilePreview'
import { announce, listen, refreshEverything } from './sync'
import { useDevLogin } from './useDevLogin'
import './devtools.css'

// Är det här appen i mobilvyns ram (se MobilePreview)? Då visas ingen panel där, den finns redan bredvid.
const IN_FRAME = window.self !== window.top

// Om mobilvyn är öppen, och i vilken storlek, sparas för fliken, så att den är kvar när man laddar om sidan.
const MOBILE_KEY = 'intresseklubben.testlage.mobil'

function savedMobile() {
  try {
    return sessionStorage.getItem(MOBILE_KEY)
  } catch {
    return null
  }
}

function saveMobile(sizeId) {
  try {
    if (sizeId) sessionStorage.setItem(MOBILE_KEY, sizeId)
    else sessionStorage.removeItem(MOBILE_KEY)
  } catch {
    // Går inte att spara: mobilvyn stängs när sidan laddas om.
  }
}

// Testpanelen, i testläget: byt konto, få saker att hända (en kontaktförfrågan, ett brev ...), visa appen i
// mobilstorlek och börja om med testdatan. Ligger ovanpå allt, nere i vänstra hörnet.
function DevPanel() {
  if (IN_FRAME) return <FrameSync />
  return <Panel />
}

// I mobilvyns ram: inget att visa, bara lyssna på panelen bredvid.
function FrameSync() {
  useEffect(() => listen(), [])
  return null
}

function Panel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const loginAs = useDevLogin()
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(savedMobile) // storleken på mobilvyn, eller null när den är stängd
  const [accounts, setAccounts] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { text, error }

  useEffect(() => {
    if (!open) return
    getDevAccounts().then(setAccounts).catch(() => setAccounts([]))
    getDevScenarios().then(setScenarios).catch(() => setScenarios([]))
  }, [open])

  function showMobile(sizeId) {
    saveMobile(sizeId)
    setMobile(sizeId)
  }

  async function run(action) {
    setBusy(true)
    setStatus(null)
    try {
      const text = await action()
      setStatus(text ? { text } : null)
    } catch (err) {
      setStatus({ text: err.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  function switchAccount(username) {
    run(async () => {
      await loginAs(username)
      announce('reload')
      return null
    })
  }

  function scenario(name) {
    run(async () => {
      const { message } = await runDevScenario(name)
      refreshEverything()
      announce('refresh')
      return message
    })
  }

  function reset() {
    run(async () => {
      const { message } = await resetDevData()
      clearCache()
      refreshEverything()
      announce('reload')
      navigate('/hem')
      return message
    })
  }

  return (
    <>
      {mobile && <MobilePreview sizeId={mobile} onSizeChange={showMobile} onClose={() => showMobile(null)} />}

      {open ? (
        <aside className="dev-panel" aria-label="Testpanel">
          <header>
            <strong>Testläge</strong>
            <button
              type="button"
              className="dev-panel-close"
              aria-label="Stäng testpanelen"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <label htmlFor="dev-panel-account">Inloggad som</label>
          <select
            id="dev-panel-account"
            value={user?.username ?? ''}
            disabled={busy}
            onChange={(e) => switchAccount(e.target.value)}
          >
            {!user && <option value="">Ingen</option>}
            {accounts.map((account) => (
              <option key={account.id} value={account.username}>
                {account.name ?? account.username}
              </option>
            ))}
            {user && !accounts.some((a) => a.username === user.username) && (
              <option value={user.username}>{user.username}</option>
            )}
          </select>

          {user && scenarios.length > 0 && (
            <>
              <p className="dev-panel-heading">Låt något hända</p>
              <div className="dev-panel-actions">
                {scenarios.map((s) => (
                  <button key={s.name} type="button" disabled={busy} onClick={() => scenario(s.name)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="dev-panel-heading">Mobil</p>
          {PHONE_URL ? (
            <p className="dev-panel-note">
              Öppna <strong>{PHONE_URL}</strong> på telefonen (samma Wi-Fi), eller skanna QR-koden i terminalen.
            </p>
          ) : (
            <p className="dev-panel-note">
              Testa på en riktig telefon: starta med <code>npm run dev:telefon</code> och skanna QR-koden.
            </p>
          )}
          <div className="dev-panel-actions">
            <button
              type="button"
              aria-pressed={Boolean(mobile)}
              onClick={() => showMobile(mobile ? null : SIZES[0].id)}
            >
              {mobile ? 'Stäng snabbkollen' : 'Snabbkoll av bredd'}
            </button>
          </div>

          <button type="button" className="dev-panel-reset" disabled={busy} onClick={reset}>
            Börja om med testdatan
          </button>

          {status && (
            <p className={status.error ? 'form-error' : 'dev-panel-status'} role="status">
              {status.text}
            </p>
          )}
        </aside>
      ) : (
        <button type="button" className="dev-panel-toggle" onClick={() => setOpen(true)}>
          Testläge
        </button>
      )}
    </>
  )
}

export default DevPanel
