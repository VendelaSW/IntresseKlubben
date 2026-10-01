import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import ServiceInfo from './pages/ServiceInfo'
import StyleGuide from './pages/StyleGuide'
import ProfilePage from './pages/ProfilePage'
import ApiStatus from './components/ApiStatus'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import DemoLayout from './pages/demo/DemoLayout'
import DemoStart from './pages/demo/DemoStart'
import DemoAuth from './pages/demo/DemoAuth'
import DemoProfile from './pages/demo/DemoProfile'
import DemoApp, { DemoComingSoon, DemoOverview } from './pages/demo/DemoApp'
import DemoPeople from './pages/demo/DemoPeople'
import DemoClubs from './pages/demo/DemoClubs'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/om" element={<ServiceInfo />} />
        {/* Ersatta av inloggning/registrering inline på /, kvar som omdirigering
            ifall någon har ett gammalt bokmärke eller en gammal länk. */}
        <Route path="/konto" element={<Navigate to="/" replace />} />
        <Route path="/logga-in" element={<Navigate to="/" replace />} />
        <Route path="/registrera" element={<Navigate to="/" replace />} />
        <Route path="/stilguide" element={<StyleGuide />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/profil" element={<ProfilePage />} />
          </Route>
        </Route>

        {/* Klickbar prototyp med påhittad data, rör inte backend. */}
        <Route path="/demo" element={<DemoLayout />}>
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
      <ApiStatus />
    </>
  )
}

export default App