import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Släpper bara igenom användare som har gjort klart sin profil, annars till
// intervjun (/profil/intervju), där profilen skapas. Ligger inuti
// ProtectedRoute, så användaren är alltid inloggad här. Backend låser samma sak (require_profile), så det går
// inte heller att nå resten av appen genom att anropa API:t direkt.
function RequireProfile() {
  const { user } = useAuth()

  if (!user.profile_completed) return <Navigate to="/profil/intervju" replace />

  return <Outlet />
}

export default RequireProfile
