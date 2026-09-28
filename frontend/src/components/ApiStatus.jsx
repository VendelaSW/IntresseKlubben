import { useEffect, useState } from 'react'
import { apiGet } from '../services/api'

function ApiStatus() {
  const [status, setStatus] = useState('kontrollerar...')

  useEffect(() => {
    apiGet('/health')
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('kunde inte nå API:et'))
  }, [])

  return <p className="api-status">API-status: {status}</p>
}

export default ApiStatus