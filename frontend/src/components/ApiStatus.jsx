import { useEffect, useState } from 'react'
import { apiGet } from '../services/api'

// Kollar en gång att backend svarar. Syns bara om något är fel: när allt
// fungerar (eller medan det kollas) visas ingenting.
function ApiStatus() {
  const [reachable, setReachable] = useState(true)

  useEffect(() => {
    apiGet('/health').catch(() => setReachable(false))
  }, [])

  if (reachable) return null

  return (
    <p className="api-status status-error" role="alert">
      Kunde inte nå servern. Kontrollera din anslutning och försök igen.
    </p>
  )
}

export default ApiStatus
