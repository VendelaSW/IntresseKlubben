import { Link } from 'react-router-dom'
import HomeLink from '../components/HomeLink'
import ProblemStatement from '../components/ProblemStatement'
import ServiceDetails from '../components/ServiceDetails'
import logo from '../assets/intresseklubben.png'

function ServiceInfo() {
  return (
    <div className="page service-page">
      <HomeLink />
      <Link to="/" className="service-logo-link">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </Link>
      <h1 className="service-heading">Om IntresseKlubben</h1>
      {/* Samma text som på startsidan och under "Läs mer om tjänsten" där. */}
      <ProblemStatement />
      <ServiceDetails />
    </div>
  )
}

export default ServiceInfo
