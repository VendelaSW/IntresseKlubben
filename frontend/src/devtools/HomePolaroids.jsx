import './homePolaroids.css'

// TILLFÄLLIGT, bara i testläget: bilderna på startsidan som polaroider (väljaren "Förstasidan", se Home och
// homePolaroids.css). Bilderna ligger i src/devtools/photos och hämtas direkt från dev-servern (inte via import eller public), så att de inte
// följer med i en vanlig build. Utanför testläget visas inte komponenten alls. De är prydnad och har ingen alternativtext.
const PHOTOS = [
  { name: 'simma', tilt: -5, drop: '0.7rem' },
  { name: 'mat', tilt: 3, drop: '-0.5rem' },
  { name: 'skratt', tilt: -2, drop: '0.9rem' },
  { name: 'dans', tilt: 4, drop: '-0.3rem' },
  { name: 'tarningar', tilt: -4, drop: '0.6rem' },
]

function HomePolaroids() {
  return (
    <ul className="home-polaroids" aria-hidden="true">
      {PHOTOS.map((photo, index) => (
        <li
          key={photo.name}
          className="home-polaroid"
          style={{ '--tilt': `${photo.tilt}deg`, '--drop': photo.drop, '--i': index }}
        >
          <img src={`/src/devtools/photos/${photo.name}.jpg`} alt="" loading="eager" />
        </li>
      ))}
    </ul>
  )
}

export default HomePolaroids
