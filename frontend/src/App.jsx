import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ServiceInfo from './pages/ServiceInfo'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/om" element={<ServiceInfo />} />
    </Routes>
  )
}

export default App
