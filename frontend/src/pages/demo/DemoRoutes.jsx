import { Route, Routes } from 'react-router-dom'
import DemoLayout from './DemoLayout'
import DemoStart from './DemoStart'
import DemoAuth from './DemoAuth'
import DemoProfile from './DemoProfile'
import DemoApp, { DemoComingSoon, DemoOverview } from './DemoApp'
import DemoPeople from './DemoPeople'
import DemoClubs from './DemoClubs'

// Demons sidor under /demo. Egen fil så att hela demon laddas först när någon öppnar den (se App.jsx).
function DemoRoutes() {
  return (
    <Routes>
      <Route element={<DemoLayout />}>
        <Route index element={<DemoStart />} />
        <Route path="registrera" element={<DemoAuth key="register" mode="register" />} />
        <Route path="logga-in" element={<DemoAuth key="login" mode="login" />} />
        <Route path="profil" element={<DemoProfile />} />
        <Route path="app" element={<DemoApp />}>
          <Route index element={<DemoOverview />} />
          <Route path="personer" element={<DemoPeople />} />
          <Route path="klubbar" element={<DemoClubs />} />
          <Route path="karta" element={<DemoComingSoon key="map" kind="map" />} />
          <Route path="evenemang" element={<DemoComingSoon key="events" kind="events" />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default DemoRoutes
