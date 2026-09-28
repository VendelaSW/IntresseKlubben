const API_URL = import.meta.env.VITE_API_URL

export async function apiGet(path) {
  if (!API_URL) {
    throw new Error('VITE_API_URL saknas. Sätt den i frontend/.env eller i Vercel.')
  }
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`API-fel: ${res.status}`)
  return res.json()
}