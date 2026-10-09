import GroupsPanel from '../components/groups/GroupsPanel'

// Klubbsidan. Ligger innanför ProtectedRoute och AppShell, som sköter
// inloggning och header. GroupsPanel är sin egen <section className="app-section">,
// som Personer-sidan, och läggs inte i content-stack (den är byggd för smala
// centrerade sidor och skulle krympa korten).
function GroupsPage() {
  return <GroupsPanel />
}

export default GroupsPage
