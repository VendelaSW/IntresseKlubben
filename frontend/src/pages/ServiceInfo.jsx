import { Link } from 'react-router-dom'
import HomeLink from '../components/HomeLink'
import logo from '../assets/intresseklubben.png'

function ServiceInfo() {
  return (
    <div className="page service-page">
      <HomeLink />
      <Link to="/" className="service-logo-link">
        <img src={logo} alt="Intresseklubben" className="logo-small" />
      </Link>
      <h1 className="service-heading">Om IntresseKlubben</h1>
      <p className="problem-statement">
        Intresseklubben hjälper dig hitta andra som delar exakt ditt intresse,
        oavsett om det är dykning, keramik eller brädspel. Du skapar en profil,
        listar dina intressen och hittar andra användare och klubbar i din
        kommun — så blir det enkelt att gå från gemensamt intresse till en
        faktisk träff.
      </p>
    </div>
  )
}

export default ServiceInfo
