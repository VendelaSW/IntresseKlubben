import { clearToken, getToken } from './auth'

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
  // Skicka med inloggningstoken om vi har en (se services/auth.js).
  const token = getToken()
  const headers = { ...options.headers }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // Token ogiltig eller utgången: släng den och signalera det globalt
    // (useAuth lyssnar på detta och loggar ut), i stället för att varje
    // sida ska behöva hantera 401 själv. Gäller bara om vi faktiskt skickade
    // en token, så ett vanligt fel lösenord vid inloggning inte loggar ut
    // någon som råkar ha en gammal token kvar.
    if (res.status === 401 && token) {
      clearToken()
      window.dispatchEvent(new Event('auth:expired'))
    }
    throw new ApiError(res.status, errorMessage(body, res.status))
  }
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

// data är valfri: utan data skickas ingen body (t.ex. PUT /profile/interests/5),
// med data skickas den som JSON (t.ex. PUT /profile/image med { key }).
export function apiPut(path, data) {
  if (data === undefined) return request(path, { method: 'PUT' })
  return request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// data är valfri, som för apiPut: med data skickas den som JSON (t.ex.
// lösenordet när man raderar sitt konto).
export function apiDelete(path, data) {
  if (data === undefined) return request(path, { method: 'DELETE' })
  return request(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function registerUser(username, email, password) {
  return apiPost('/users/register', { username, email, password })
}

export function loginUser(username, password) {
  return apiPost('/users/login', { username, password })
}

export function getCurrentUser() {
  return apiGet('/users/me')
}

// Raderar kontot och allt som hör till det. Fel lösenord ger 403 (inte 401),
// så man loggas inte ut av ett felskrivet lösenord.
export function deleteAccount(password) {
  return apiDelete('/users/me', { password })
}

// För konton som skapades innan e-post krävdes. Går bara när e-post saknas.
export function addMyEmail(email) {
  return apiPut('/users/me/email', { email })
}
