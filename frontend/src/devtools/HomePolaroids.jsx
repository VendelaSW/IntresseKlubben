import './homePolaroids.css'

// TILLFÄLLIGT, bara i testläget: filmerna på startsidan som polaroider (väljaren "Förstasidan", se Home och
// homePolaroids.css). De spelas samtidigt, var och en i en slinga och utan ljud. Filmerna och stillbilderna ligger i
// src/devtools/video och hämtas direkt från dev-servern (inte via import eller public), så att de inte följer med i en
// vanlig build. Utanför testläget visas inte komponenten alls. De är prydnad och har ingen alternativtext.
const CLIPS = [
  { name: 'swim', tilt: -5, drop: '0.7rem' },
  { name: 'mat', tilt: 3, drop: '-0.5rem' },
  { name: 'spel', tilt: -2, drop: '0.9rem' },
  { name: 'dans', tilt: 4, drop: '-0.3rem' },
  { name: 'klattra', tilt: -4, drop: '0.6rem' },
  { name: 'katt', tilt: 2, drop: '-0.4rem' },
]

const file = (name, extension) => `/src/devtools/video/${name}.${extension}`

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function HomePolaroids() {
  // Den som har valt bort rörelse i systemet får bara stillbilderna.
  const still = reducedMotion()

  return (
    <ul className="home-polaroids" aria-hidden="true">
      {CLIPS.map((clip, index) => (
        <li key={clip.name} className="home-polaroid" style={{ '--tilt': `${clip.tilt}deg`, '--drop': clip.drop, '--i': index }}>
          <video
            src={file(clip.name, 'mp4')}
            poster={file(clip.name, 'jpg')}
            autoPlay={!still}
            loop
            muted
            playsInline
            preload={still ? 'none' : 'auto'}
            tabIndex={-1}
          />
        </li>
      ))}
    </ul>
  )
}

export default HomePolaroids
