import { Link } from 'react-router-dom'
import logo from '../assets/intresseklubben.png'
import mapImage from '../assets/map.jpg'
import ProblemStatement from '../components/ProblemStatement'

function Home() {
  return (
    <>
      <header className="top-banner">
        <nav className="banner-actions">
          <Link to="/logga-in" className="banner-link">
            Logga in
          </Link>
          <Link to="/registrera" className="banner-button">
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
        <Link to="/om" className="info-link">
          Läs mer om tjänsten
        </Link>
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

export default Home
