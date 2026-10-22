import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { deleteAccount } from '../services/api'
import Modal from './Modal'

// Längst ner under Redigera profil. Först en liten röd knapp (inte större än de
// andra valen, SCRUM-255), sedan en bekräftelse i en popup där lösenordet krävs,
// så att ingen raderar kontot av misstag. Efteråt loggas man ut och hamnar på
// startsidan.
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

  return (
    <>
      <button
        type="button"
        className="secondary-button button-small button-danger touch-target"
        onClick={() => setOpen(true)}
      >
        Radera konto
      </button>
      {open && (
        // Medan kontot raderas går popupen inte att stänga.
        <Modal title="Radera konto" onClose={() => !busy && close()}>
          <form className="auth-form form-compact" onSubmit={handleSubmit}>
            <p className="form-error">
              Din profil, dina meddelanden, kompisar och events raderas för gott. Klubbar du äger går
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
            {/* Ingen egen Avbryt-knapp: popupens Stäng (och Escape) behåller kontot. Knappen ser ut som Radera konto
                (inte bleknad medan lösenordet saknas): ett tomt fält stoppas av required på fältet. */}
            <button type="submit" className="button-danger delete-account-confirm touch-target" disabled={busy}>
              {busy ? 'Raderar...' : 'Radera kontot för gott'}
            </button>
          </form>
        </Modal>
      )}
    </>
  )
}

export default DeleteAccount
