import { lazy, Suspense } from 'react'
import { useStartView } from '../hooks/useStartView'
import AppShell from './AppShell'

// Kartbiblioteket är stort, så kartan laddas först när den behövs.
const MapPrototype = lazy(() => import('../pages/MapPrototype'))

// Startsidan (/hem): kartan i helskärm, eller appens vanliga startsida i
// AppShell (som visar /hem:s egen sida, HubPage, i sin Outlet). Se
// useStartView för hur valet görs.
function HomeSwitch() {
  const view = useStartView()
  if (view === 'klassisk') return <AppShell />
  return (
    <Suspense fallback={<p className="hint-text">Laddar karta...</p>}>
      <MapPrototype />
    </Suspense>
  )
}

export default HomeSwitch
