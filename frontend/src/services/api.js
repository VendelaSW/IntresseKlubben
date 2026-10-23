import { clearToken, getToken } from './auth'
import { MINUTE, cached, queryClient } from './queryClient'

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

// Man loggar in med användarnamn eller e-post i samma fält.
export function loginUser(usernameOrEmail, password) {
  return apiPost('/users/login', { username_or_email: usernameOrEmail, password })
}

export const CURRENT_USER_KEY = ['current-user']

// Sparas i minnet (se queryClient.js): inloggningen hämtar den vid start, och
// profilsidan får den sedan utan ett nytt anrop.
export function getCurrentUser() {
  return cached(CURRENT_USER_KEY, () => apiGet('/users/me'), 5 * MINUTE)
}

// Raderar kontot och allt som hör till det. Fel lösenord ger 403 (inte 401),
// så man loggas inte ut av ett felskrivet lösenord.
export function deleteAccount(password) {
  return apiDelete('/users/me', { password })
}

// Ändrar användarnamn och/eller e-post: { password, username?, email? }. Även
// för konton som saknar e-post. Fel lösenord ger 403 (inte 401), så man loggas
// inte ut av ett felskrivet lösenord. Svarar med de nya uppgifterna (som /users/me).
export async function updateAccount(changes) {
  return queryClient.setQueryData(CURRENT_USER_KEY, await apiPatch('/users/me', changes))
}

// Skickar en ny länk för att bekräfta e-postadressen till den inloggades e-post.
// 429 om ett mejl skickades nyss.
export function sendVerificationEmail() {
  return apiPost('/users/me/email-verification')
}

// Bekräftar e-postadressen med koden från länken i mejlet. Kräver ingen
// inloggning. Är man inloggad hämtas kontot om, så att profilen visar det.
export async function verifyEmail(token) {
  await apiPost('/users/verify-email', { token })
  queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY })
}

// Glömt lösenord: skickar en länk för att välja ett nytt till kontots e-post.
// Svarar likadant oavsett om kontot finns.
export function forgotPassword(usernameOrEmail) {
  return apiPost('/users/forgot-password', { username_or_email: usernameOrEmail })
}

// Nytt lösenord med koden från återställningsmejlet. Andra inloggningar slutar gälla.
export function resetPassword(token, newPassword) {
  return apiPost('/users/reset-password', { token, new_password: newPassword })
}

// Byt lösenord: det nya gäller först när bytet bekräftats via mejlet. Fel
// nuvarande lösenord ger 403 (inte 401), så man loggas inte ut av ett felskrivet lösenord.
export function requestPasswordChange(currentPassword, newPassword) {
  return apiPost('/users/me/password', { current_password: currentPassword, new_password: newPassword })
}

// Bekräftar bytet med koden från mejlet. Andra inloggningar slutar gälla.
export function confirmPasswordChange(token) {
  return apiPost('/users/confirm-password-change', { token })
}

// Om ett användarnamn och/eller en e-post redan används av någon annan:
// { username, email } med samma meddelanden som när man sparar, null = ledigt.
export function checkAvailability({ username = '', email = '' }) {
  const params = new URLSearchParams()
  if (username.trim()) params.set('username', username)
  if (email.trim()) params.set('email', email)
  return apiGet(`/users/me/availability?${params}`)
}
