import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ServiceInfo from './pages/ServiceInfo'
import AccountChoice from './pages/AccountChoice'
import LoginForm from './pages/LoginForm'
import RegisterForm from './pages/RegisterForm'
import ProfilePage from './pages/ProfilePage'
import ApiStatus from './components/ApiStatus'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/om" element={<ServiceInfo />} />
        <Route path="/konto" element={<AccountChoice />} />
        <Route path="/logga-in" element={<LoginForm />} />
        <Route path="/registrera" element={<RegisterForm />} />
        <Route path="/profil" element={<ProfilePage />} />
      </Routes>
      <ApiStatus />
    </>
  )
}

export default App