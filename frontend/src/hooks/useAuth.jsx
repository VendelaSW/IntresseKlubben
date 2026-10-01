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

  function login(token) {
    setToken(token)
    setLoading(true)
    return getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false))
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
