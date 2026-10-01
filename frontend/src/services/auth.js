// Inloggningstoken från POST /users/login. Sparas i webbläsaren så att man
// förblir inloggad mellan sidladdningar (tills token går ut efter 7 dagar).
// try/catch: localStorage kan vara blockerat, t.ex. i vissa privata lägen.
const TOKEN_KEY = 'intresseklubben.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Går inte att spara: inloggningen gäller bara tills sidan laddas om.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Inget att rensa.
  }
}

export function isLoggedIn() {
  return getToken() !== null
}
