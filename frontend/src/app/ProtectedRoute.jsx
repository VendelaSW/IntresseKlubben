import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePrefetchPages } from '../hooks/usePrefetchPages'

// Släpper bara igenom inloggade användare till de inkapslade routarna,
// annars tillbaka till startsidan. Visar inget medan inloggningen
// fortfarande kollas (undviker att blinka till startsidan i onödan).
// Förladdar också appens sidor (se usePrefetchPages).
function ProtectedRoute() {
  const { user, loading } = useAuth()
  usePrefetchPages(user?.profile_completed ? user.id : null)

  if (loading) return null
  if (!user) return <Navigate to="/" replace />

  return <Outlet />
}

export default ProtectedRoute
