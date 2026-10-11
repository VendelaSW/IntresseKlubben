import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { deleteAccount } from '../services/api'

// Längst ner på den egna profilen. Först en knapp, sedan en bekräftelse där
// lösenordet krävs, så att ingen raderar kontot av misstag. Efteråt loggas man
// ut och hamnar på startsidan.
function DeleteAccount() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function close() {
    setOpen(false)
    setPassword('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await deleteAccount(password)
      logout()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        Radera konto
      </button>
    )
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Radera konto</h2>
      <p className="form-error">
        Din profil, dina meddelanden, kontakter och events raderas för gott. Klubbar du äger går
        vidare till den som varit med längst. Det går inte att ångra.
      </p>
      <label htmlFor="delete-account-password">Skriv ditt lösenord för att bekräfta</label>
      <input
        id="delete-account-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy || password === ''}>
        {busy ? 'Raderar...' : 'Radera kontot för gott'}
      </button>
      <button type="button" className="button-secondary" onClick={close} disabled={busy}>
        Avbryt
      </button>
    </form>
  )
}

export default DeleteAccount
