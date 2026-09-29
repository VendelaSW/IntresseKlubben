const API_URL = import.meta.env.VITE_API_URL

export async function apiGet(path) {
  if (!API_URL) {
    throw new Error('VITE_API_URL saknas. Sätt den i frontend/.env eller i Vercel.')
  }
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`API-fel: ${res.status}`)
  return res.json()
}

export async function apiPost(path, body) {
  if (!API_URL) {
    throw new Error('VITE_API_URL saknas. Sätt den i frontend/.env eller i Vercel.')
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    // Backend skickar { detail: "..." } vid 409 (t.ex. upptaget
    // användarnamn) och { detail: [{msg, ...}, ...] } vid 422
    // (valideringsfel). Ett obehandlat 500-fel har inget JSON-body
    // alls, då faller vi tillbaka på ett generiskt meddelande.
    const data = await res.json().catch(() => null)
    const message = Array.isArray(data?.detail)
      ? data.detail.map((d) => d.msg).join(', ')
      : data?.detail || `API-fel: ${res.status}`
    throw new Error(message)
  }
  return res.json()
}

export function registerUser(username, password) {
  return apiPost('/users/register', { username, password })
}
