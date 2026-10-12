import { Component } from 'react'
import { MapActionsContext } from '../components/ShowOnMapButton'
import EventsPage from './EventsPage'
import GroupsPage from './GroupsPage'
import InboxPage from './InboxPage'
import MapPad from './MapPad'
import PeoplePage from './PeoplePage'

// Appens övriga sidor som anteckningsblock på kartan, som profilen (se
// MapPad). Inuti ligger de vanliga sidorna, så allt fungerar som i appen.
// Länkar vidare (t.ex. till någons profil eller en konversation) leder än så
// länge till appens vanliga sidor.
export const MAP_PAGES = [
  { id: 'brev', title: 'Brev', Page: InboxPage },
  { id: 'personer', title: 'Personer', Page: PeoplePage },
  { id: 'klubbar', title: 'Klubbar', Page: GroupsPage },
  { id: 'events', title: 'Events', Page: EventsPage },
]

// Kraschar en sida i blocket visas ett fel i blocket i stället, så att inte
// hela kartan försvinner.
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <p className="form-error">Kunde inte visa sidan. Försök igen senare.</p>
    return this.props.children
  }
}

// `mapActions`: "Visa på kartan" för klubbar och events (se ShowOnMapButton).
function MapPagePad({ page, onClose, mapActions }) {
  const { title, Page } = MAP_PAGES.find((p) => p.id === page)
  return (
    <MapPad title={title} wide onClose={onClose}>
      <div className="map-pad-app-page">
        <PageErrorBoundary>
          <MapActionsContext.Provider value={mapActions}>
            <Page />
          </MapActionsContext.Provider>
        </PageErrorBoundary>
      </div>
    </MapPad>
  )
}

export default MapPagePad
