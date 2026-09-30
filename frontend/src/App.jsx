import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ServiceInfo from './pages/ServiceInfo'
import AccountChoice from './pages/AccountChoice'
import LoginForm from './pages/LoginForm'
import RegisterForm from './pages/RegisterForm'
import StyleGuide from './pages/StyleGuide'
import ProfilePage from './pages/ProfilePage'
import UserProfilePage from './pages/UserProfilePage'
import ApiStatus from './components/ApiStatus'
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
        <Route path="/konto" element={<AccountChoice />} />
        <Route path="/logga-in" element={<LoginForm />} />
        <Route path="/registrera" element={<RegisterForm />} />
        <Route path="/stilguide" element={<StyleGuide />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/anvandare/:username" element={<UserProfilePage />} />

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