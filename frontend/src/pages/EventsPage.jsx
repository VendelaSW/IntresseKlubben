import EventsPanel from '../components/events/EventsPanel'

// Egen sida för events, uppbyggd som GroupsPage. Ligger innanför
// ProtectedRoute och AppShell, som sköter inloggning och header.
function EventsPage() {
  return (
    <div className="content-stack">
      <EventsPanel titleTag="h1" />
    </div>
  )
}

export default EventsPage
