import { Component, useContext, useMemo, useRef, useState } from 'react'
import {
  Route,
  Routes,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  matchPath,
  parsePath,
} from 'react-router-dom'
import { MapActionsContext } from '../components/ShowOnMapButton'
import ConversationPage from './ConversationPage'
import EventsPage from './EventsPage'
import GroupsPage from './GroupsPage'
import InboxPage from './InboxPage'
import MapPad from './MapPad'
import PeoplePage from './PeoplePage'
import ProfilePage from './ProfilePage'
import UserProfilePage from './UserProfilePage'

// Appens övriga sidor som anteckningsblock på kartan, som profilen (se
// MapPad). Inuti ligger de vanliga sidorna, så allt fungerar som i appen.
//
// Blocket har en egen liten historik: länkar och navigate() till sidorna
// nedan (en konversation, någons profil, en klubb, ett event, profilen)
// öppnas i blocket i stället för att lämna kartan, och "Tillbaka" går bakåt
// i blocket. Allt annat (t.ex. startsidan eller intervjun) navigerar som
// vanligt i appen.

// Startsidan i blocket för varje widget (se MapPageWidgets).
export const MAP_PAGES = {
  brev: '/meddelanden',
  personer: '/personer',
  klubbar: '/klubbar',
  events: '/events',
}

// Sidorna som kan visas i blocket, och blockets rubrik för dem.
const PAD_ROUTES = [
  { path: '/meddelanden', title: 'Brev', Page: InboxPage },
  { path: '/meddelanden/:userId', title: 'Brev', Page: ConversationPage },
  { path: '/personer', title: 'Personer', Page: PeoplePage },
  { path: '/anvandare/:userId', title: 'Personer', Page: UserProfilePage },
  { path: '/klubbar', title: 'Klubbar', Page: GroupsPage },
  { path: '/events', title: 'Events', Page: EventsPage },
  { path: '/profil', title: 'Min profil', Page: ProfilePage },
]

const padRouteFor = (pathname) => PAD_ROUTES.find((r) => matchPath(r.path, pathname)) ?? null

// En adress (sträng eller { pathname, search, hash }) som en location.
let nextKey = 0
function toLocation(to) {
  const path = typeof to === 'string' ? parsePath(to) : to
  nextKey += 1
  return {
    pathname: path.pathname ?? '/',
    search: path.search ?? '',
    hash: path.hash ?? '',
    state: null,
    key: `pad-${nextKey}`,
  }
}

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

// `start`: sidan blocket öppnas på, t.ex. '/meddelanden' eller
// '/klubbar?klubb=3'. `mapActions`: "Visa på kartan" för klubbar och events
// (se ShowOnMapButton).
function MapPagePad({ start, onClose, mapActions }) {
  const parent = useContext(NavigationContext)
  // Blockets historik, senaste sidan sist.
  const [history, setHistory] = useState(() => [toLocation(start)])
  const location = history.at(-1)
  const historyRef = useRef(history)
  historyRef.current = history

  // Navigatorn som sidorna i blocket använder (via Link och useNavigate).
  // Sidor som finns i blocket öppnas här, allt annat går till appens.
  const navigation = useMemo(() => {
    const navigator = {
      createHref: (to) => parent.navigator.createHref(to),
      encodeLocation: parent.navigator.encodeLocation,
      push(to, state, opts) {
        const next = toLocation(to)
        if (!padRouteFor(next.pathname)) return parent.navigator.push(to, state, opts)
        setHistory((h) => [...h, next])
      },
      replace(to, state, opts) {
        const next = toLocation(to)
        if (!padRouteFor(next.pathname)) return parent.navigator.replace(to, state, opts)
        setHistory((h) => [...h.slice(0, -1), next])
      },
      // Bakåt i blocket. Finns inget att gå tillbaka till stängs blocket.
      go(delta) {
        if (delta >= 0) return
        const h = historyRef.current
        if (h.length + delta < 1) onClose()
        else setHistory(h.slice(0, h.length + delta))
      },
    }
    return { ...parent, navigator }
  }, [parent, onClose])

  const title = padRouteFor(location.pathname)?.title ?? ''

  return (
    <MapPad title={title} wide onClose={onClose}>
      <div className="map-pad-app-page">
        {/* key: en ny sida i blocket nollställer felet. Ändras bara ?-delen (t.ex.
            vilken klubb som visas) ligger sidan kvar, som i appen. */}
        <PageErrorBoundary key={location.pathname}>
          <MapActionsContext.Provider value={mapActions}>
            <NavigationContext.Provider value={navigation}>
              {/* Sidorna matchas mot blockets adress, inte kartans. */}
              <RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
                <Routes location={location}>
                  {PAD_ROUTES.map(({ path, Page }) => (
                    <Route key={path} path={path} element={<Page />} />
                  ))}
                </Routes>
              </RouteContext.Provider>
            </NavigationContext.Provider>
          </MapActionsContext.Provider>
        </PageErrorBoundary>
      </div>
    </MapPad>
  )
}

export default MapPagePad
