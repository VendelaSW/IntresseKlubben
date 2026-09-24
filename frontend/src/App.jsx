import logo from './assets/intresseklubben.png'
import mapImage from './assets/map.jpg'
import ProblemStatement from './components/ProblemStatement'

function App() {
  return (
    <div className="page">
      <header className="hero">
        <img src={logo} alt="Intresseklubben" className="logo" />
        <p className="tagline">Vi antecknar, ni träffas.</p>
      </header>
      <ProblemStatement />
      <section className="map-section">
        <img
          src={mapImage}
          alt="Karta som visar personer med olika intressen, som dykning, keramik och fotboll, utplacerade i en stad"
          className="map-image"
        />
      </section>
    </div>
  )
}

export default App
