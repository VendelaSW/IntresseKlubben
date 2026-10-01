import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Släpper bara igenom inloggade användare till de inkapslade routarna,
// annars tillbaka till startsidan. Visar inget medan inloggningen
// fortfarande kollas (undviker att blinka till startsidan i onödan).
function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/" replace />

  return <Outlet />
}

export default ProtectedRoute
