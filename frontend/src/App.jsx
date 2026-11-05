import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import ServiceInfo from './pages/ServiceInfo'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ConfirmPasswordPage from './pages/ConfirmPasswordPage'
import ProfilePage from './pages/ProfilePage'
import ProfileInterview from './pages/ProfileInterview'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import RequireProfile from './components/RequireProfile'
import { useAuth } from './hooks/useAuth'
import { DEV_MODE } from './devtools/devMode'

// Kartbiblioteket är stort, så kartan laddas först när den behövs.
const MapPrototype = lazy(() => import('./pages/MapPrototype'))
// Startsidan laddas för sig, så att kartans stilar (map.css) inte följer med på alla sidor.
const StartPage = lazy(() => import('./pages/StartPage'))
// Stilguiden och demon används sällan, så de laddas inte för alla besökare.
const StyleGuide = lazy(() => import('./pages/StyleGuide'))
const DemoRoutes = lazy(() => import('./pages/demo/DemoRoutes'))

// Testpanelen finns bara i testläget (npm run dev:test), och kommer inte ens med i en vanlig build.
const DevPanel = DEV_MODE ? lazy(() => import('./devtools/DevPanel')) : null

// Appens sidor (Brev, Personer, Klubbar, Events, profiler) finns bara som block
// på kartan. Deras gamla adresser, t.ex. ett bokmärke eller en länk till
// /klubbar?klubb=3, öppnar kartan med sidan i ett block (se MapPrototype).
const MAP_PAD_PATHS = [
  '/klubbar',
  '/personer',
  '/events',
  '/meddelanden',
  '/meddelanden/:userId',
  '/anvandare/:userId',
  '/moderering',
  '/notiser',
]

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
        <Route
          path="/"
          element={
            <Suspense fallback={null}>
              <StartPage />
            </Suspense>
          }
        />
        <Route path="/om" element={<ServiceInfo />} />
        {/* Länkarna i mejlen. Utanför inloggningen: de ska fungera även utloggad. */}
        <Route path="/verifiera" element={<VerifyEmailPage />} />
        <Route path="/aterstall" element={<ResetPasswordPage />} />
        <Route path="/bekrafta-losenord" element={<ConfirmPasswordPage />} />
        {/* Startsidans adress medan den testades, kvar ifall någon har sparat länken. */}
        <Route path="/ny-start" element={<Navigate to="/" replace />} />
        {/* Inloggning och registrering på egna sidor, med samma lapp som på startsidan. */}
        <Route path="/logga-in" element={<AuthPage key="login" mode="login" />} />
        <Route path="/registrera" element={<AuthPage key="register" mode="register" />} />
        {/* Ersatt av inloggning/registrering inline på /, kvar som omdirigering
            ifall någon har ett gammalt bokmärke eller en gammal länk. */}
        <Route path="/konto" element={<Navigate to="/" replace />} />
        <Route
          path="/stilguide"
          element={
            <Suspense fallback={null}>
              <StyleGuide />
            </Suspense>
          }
        />

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
        <Route
          path="/demo/*"
          element={
            <Suspense fallback={null}>
              <DemoRoutes />
            </Suspense>
          }
        />
      </Routes>
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </>
  )
}

export default App