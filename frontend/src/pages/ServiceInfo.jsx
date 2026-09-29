import { Link } from 'react-router-dom'
import DirectionTeaser from '../components/DirectionTeaser'
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
        listar dina intressen och ser andra användare och intressegrupper på en
        karta nära dig — så blir det enkelt att gå från gemensamt intresse till
        en faktisk träff.
      </p>
      <DirectionTeaser />
    </div>
  )
}

export default ServiceInfo
