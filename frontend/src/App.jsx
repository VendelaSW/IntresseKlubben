import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import ServiceInfo from './pages/ServiceInfo'
import StyleGuide from './pages/StyleGuide'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ProfilePage from './pages/ProfilePage'
import ProfileInterview from './pages/ProfileInterview'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import RequireProfile from './components/RequireProfile'
import { useAuth } from './hooks/useAuth'
import DemoLayout from './pages/demo/DemoLayout'
import DemoStart from './pages/demo/DemoStart'
import DemoAuth from './pages/demo/DemoAuth'
import DemoProfile from './pages/demo/DemoProfile'
import DemoApp, { DemoComingSoon, DemoOverview } from './pages/demo/DemoApp'
import DemoPeople from './pages/demo/DemoPeople'
import DemoClubs from './pages/demo/DemoClubs'

// Kartbiblioteket är stort, så kartan laddas först när den behövs.
const MapPrototype = lazy(() => import('./pages/MapPrototype'))

// Appens sidor (Brev, Personer, Klubbar, Events, profiler) finns bara som block
// på kartan. Deras gamla adresser, t.ex. ett bokmärke eller en länk till
// /klubbar?klubb=3, öppnar kartan med sidan i ett block (se MapPrototype).
const MAP_PAD_PATHS = ['/klubbar', '/personer', '/events', '/meddelanden', '/meddelanden/:userId', '/anvandare/:userId']

function OpenOnMap() {
  const { pathname, search } = useLocation()
  return <Navigate to="/hem" replace state={{ pad: pathname + search }} />
}

// Min profil är ett block på kartan, som de andra sidorna. Den som inte har gjort
// klart sin profil kommer inte åt kartan än, och fyller i formuläret här, i
// AppShell (/profil?lista=1, se ProfilePage).
function ProfileRoute() {
  const { user } = useAuth()
  return user.profile_completed ? <OpenOnMap /> : <AppShell />
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/om" element={<ServiceInfo />} />
        {/* Länken i bekräftelsemejlet. Utanför inloggningen: den ska fungera även utloggad. */}
        <Route path="/verifiera" element={<VerifyEmailPage />} />
        {/* Ersatta av inloggning/registrering inline på /, kvar som omdirigering
            ifall någon har ett gammalt bokmärke eller en gammal länk. */}
        <Route path="/konto" element={<Navigate to="/" replace />} />
        <Route path="/logga-in" element={<Navigate to="/" replace />} />
        <Route path="/registrera" element={<Navigate to="/" replace />} />
        <Route path="/stilguide" element={<StyleGuide />} />

        <Route element={<ProtectedRoute />}>
          {/* Bara för inloggade med klar profil. Kartan tar hela skärmen. */}
          <Route element={<RequireProfile />}>
            <Route
              path="/hem"
              element={
                <Suspense fallback={<p className="hint-text">Laddar karta...</p>}>
                  <MapPrototype />
                </Suspense>
              }
            />
            <Route path="/karta-prototyp" element={<Navigate to="/hem" replace />} />
            {MAP_PAD_PATHS.map((path) => (
              <Route key={path} path={path} element={<OpenOnMap />} />
            ))}
          </Route>
          {/* Intervjun har en egen helskärmsvy, utan menyn. */}
          <Route path="/profil/intervju" element={<ProfileInterview />} />
          <Route path="/profil" element={<ProfileRoute />}>
            <Route index element={<ProfilePage />} />
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
    </>
  )
}

export default App