import { Link } from 'react-router-dom'
import logo from '../../assets/intresseklubben.png'
import mapImage from '../../assets/map.jpg'
import ProblemStatement from '../../components/ProblemStatement'

// Samma innehåll som riktiga startsidan, men knapparna leder vidare i demon.
function DemoStart() {
  return (
    <>
      <header className="top-banner">
        <nav className="banner-actions">
          <Link to="/demo/logga-in" className="banner-link">
            Logga in
          </Link>
          <Link to="/demo/registrera" className="banner-button">
            Registrera dig
          </Link>
        </nav>
      </header>
      <div className="page">
        <section className="hero">
          <img src={logo} alt="Intresseklubben" className="logo" />
          <p className="tagline">Vi antecknar, ni träffas.</p>
        </section>
        <ProblemStatement />
        <section className="map-section">
          <img
            src={mapImage}
            alt="Karta som visar personer med olika intressen, som dykning, keramik och fotboll, utplacerade i en stad"
            className="map-image"
          />
        </section>
      </div>
    </>
  )
}

export default DemoStart
