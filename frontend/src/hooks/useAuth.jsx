import { createContext, useContext, useEffect, useState } from 'react'
import { getCurrentUser } from '../services/api'
import { clearToken, isLoggedIn, setToken } from '../services/auth'

// Delad inloggningsstatus för hela appen. Vid start kollas om en sparad
// token redan finns och fortfarande är giltig genom att hämta GET /users/me.

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false)
      return
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        // Token ogiltig/utgången: api.js har redan rensat den (se 401-hanteringen).
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // api.js skickar detta när ett anrop får 401 med en token satt, t.ex.
    // om token hinner gå ut medan man redan är inne i appen. Gäller alla
    // sidor, inte bara den som råkade göra anropet som misslyckades.
    function handleExpired() {
      logout()
    }
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [])

  // POST /users/login ger redan tillbaka användaren i svaret, så inget extra
  // anrop till /users/me behövs här.
  function login(token, user) {
    setToken(token)
    setUser(user)
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
