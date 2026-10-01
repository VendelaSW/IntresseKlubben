import GroupsPanel from '../components/groups/GroupsPanel'

// Tillfällig egen sida för klubbar. Ligger innanför ProtectedRoute och
// AppShell, som sköter inloggning och header. Senare flyttas GroupsPanel in i
// ett litet fönster som öppnas från en knapp, och då kan sidan tas bort.
function GroupsPage() {
  return (
    <div className="content-stack">
      <GroupsPanel titleTag="h1" />
    </div>
  )
}

export default GroupsPage
