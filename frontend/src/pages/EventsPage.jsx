import EventsPanel from '../components/events/EventsPanel'

// Eventsidan, uppbyggd som GroupsPage. Ligger innanför ProtectedRoute och
// AppShell, som sköter inloggning och header. EventsPanel är sin egen
// <section className="app-section"> och läggs inte i content-stack (den är
// byggd för smala centrerade sidor och skulle krympa korten).
function EventsPage() {
  return <EventsPanel />
}

export default EventsPage
