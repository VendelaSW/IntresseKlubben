const API_URL = import.meta.env.VITE_API_URL

// Fel från API:et. status = HTTP-koden, message = backendens förklaring
// (t.ex. "Namn får inte vara tomt") när en sådan finns.
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// FastAPI skickar antingen {"detail": "text"} eller, vid valideringsfel (422),
// {"detail": [{"msg": "Value error, text"}, ...]}.
function errorMessage(body, status) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg.replace(/^Value error, /, '')).join(' ')
  }
  return `API-fel: ${status}`
}

async function request(path, options = {}) {
  if (!API_URL) {
    throw new Error('VITE_API_URL saknas. Sätt den i frontend/.env eller i Vercel.')
  }
  const res = await fetch(`${API_URL}${path}`, options)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status))
  return body
}

export function apiGet(path) {
  return request(path)
}

export function apiPost(path, data) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function apiPatch(path, data) {
  return request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function apiPut(path) {
  return request(path, { method: 'PUT' })
}

export function apiDelete(path) {
  return request(path, { method: 'DELETE' })
}

export function registerUser(username, password) {
  return apiPost('/users/register', { username, password })
}

export function loginUser(username, password) {
  return apiPost('/users/login', { username, password })
}
