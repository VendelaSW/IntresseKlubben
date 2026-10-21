import { useEffect, useState } from 'react'
import { getDevAccounts } from './api'
import { useDevLogin } from './useDevLogin'
import './devtools.css'

// "Logga in som ...": testkontona på startsidan, i testläget.
function DevLogin() {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState('')
  const loginAs = useDevLogin()

  useEffect(() => {
    getDevAccounts()
      .then(setAccounts)
      .catch(() => setError('Hittar inte testlägets backend. Startade du med npm run dev:test?'))
  }, [])

  async function handleClick(username) {
    setError('')
    try {
      await loginAs(username)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="dev-login" aria-labelledby="dev-login-title">
      <h2 id="dev-login-title">Testläge: logga in som</h2>
      {error && <p className="form-error">{error}</p>}
      {accounts === null && !error && <p className="hint-text">Hämtar testkonton…</p>}
      <ul>
        {accounts?.map((account) => (
          <li key={account.id}>
            <button type="button" onClick={() => handleClick(account.username)}>
              <strong>{account.name ?? account.username}</strong>
              <span>{account.about}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default DevLogin
