import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import HomeLink from '../components/HomeLink'
import GroupsPanel from '../components/groups/GroupsPanel'
import { isLoggedIn } from '../services/auth'

// Tillfällig egen sida för klubbar. Senare flyttas GroupsPanel in i ett litet
// fönster som öppnas från en knapp, och då kan sidan tas bort.
function GroupsPage() {
  const navigate = useNavigate()
  const toLogin = useCallback(() => navigate('/logga-in', { replace: true }), [navigate])

  useEffect(() => {
    if (!isLoggedIn()) toLogin()
  }, [toLogin])

  if (!isLoggedIn()) return null

  return (
    <div className="page">
      <HomeLink />
      <GroupsPanel onUnauthorized={toLogin} titleTag="h1" />
    </div>
  )
}

export default GroupsPage
