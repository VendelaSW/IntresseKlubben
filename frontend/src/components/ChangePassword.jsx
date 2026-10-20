import { useState } from 'react'
import { requestPasswordChange } from '../services/api'

// Under Redigera profil, bredvid Radera konto (eget formulär: formulär går inte
// att lägga i varandra). Först en knapp, sedan nuvarande och nytt lösenord.
// Det nya gäller först när man klickat på länken i mejlet som skickas (se
// ConfirmPasswordPage); fram till dess gäller det gamla. `email` är kontots
// e-post, som mejlet går till.
function ChangePassword({ email }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [status, setStatus] = useState('form') // 'form' | 'sending' | 'sent'
  const [error, setError] = useState('')

  function close() {
    setOpen(false)
    setCurrent('')
    setPassword('')
    setRepeat('')
    setError('')
    setStatus('form')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (password !== repeat) {
      setError('De nya lösenorden är inte likadana.')
      return
    }
    setError('')
    setStatus('sending')
    try {
      await requestPasswordChange(current, password)
      setStatus('sent')
    } catch (err) {
      setError(err.message)
      setStatus('form')
    }
  }

  if (!open) {
    return (
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        Byt lösenord
      </button>
    )
  }

  if (status === 'sent') {
    return (
      <div className="auth-form">
        <h2>Byt lösenord</h2>
        <p className="form-success">
          Vi har skickat ett mejl till {email}. Klicka på länken i mejlet för att bekräfta. Fram till dess gäller
          ditt gamla lösenord.
        </p>
        <button type="button" className="button-secondary" onClick={close}>
          Stäng
        </button>
      </div>
    )
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Byt lösenord</h2>
      {!email && <p className="form-error">Lägg till en e-postadress ovan först, så att vi kan bekräfta bytet.</p>}
      <label htmlFor="change-password-current">Nuvarande lösenord</label>
      <input
        id="change-password-current"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <label htmlFor="change-password-new">Nytt lösenord</label>
      <input
        id="change-password-new"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <label htmlFor="change-password-repeat">Skriv det nya lösenordet igen</label>
      <input
        id="change-password-repeat"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        required
      />
      <p className="hint-text">Minst 8 tecken. Vi skickar ett mejl för att bekräfta bytet.</p>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={!email || status === 'sending'}>
        {status === 'sending' ? 'Skickar...' : 'Byt lösenord'}
      </button>
      {/* Heter inte "Avbryt": under Redigera profil finns redan en Avbryt för redigeringen. */}
      <button type="button" className="button-secondary" onClick={close} disabled={status === 'sending'}>
        Behåll lösenordet
      </button>
    </form>
  )
}

export default ChangePassword
