import { useState } from 'react'
import { sendVerificationEmail } from '../services/api'

// Under e-posten på profilen: om adressen är bekräftad, och annars en knapp
// som skickar en länk för att bekräfta den (se VerifyEmailPage). Konton som
// saknar e-post lägger till en under Redigera profil först.
function EmailVerification({ account }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'sending' | 'sent'
  const [error, setError] = useState('')

  if (!account?.email) return null
  if (account.email_verified) {
    return <span className="status-pill status-pill-success">E-posten är bekräftad</span>
  }

  async function handleSend() {
    setError('')
    setStatus('sending')
    try {
      await sendVerificationEmail()
      setStatus('sent')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <p className="form-success">
        Vi har skickat ett mejl till {account.email}. Klicka på länken i mejlet för att bekräfta adressen.
      </p>
    )
  }

  return (
    <div className="content-stack">
      <p className="hint-text">Din e-postadress är inte bekräftad än.</p>
      <button type="button" className="secondary-button button-small" disabled={status === 'sending'} onClick={handleSend}>
        {status === 'sending' ? 'Skickar...' : 'Verifiera din e-post'}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export default EmailVerification
