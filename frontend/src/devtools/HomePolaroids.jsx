import './homePolaroids.css'

// TILLFÄLLIGT, bara i testläget: filmerna på startsidan som polaroider (väljaren "Förstasidan", se Home och
// homePolaroids.css). De spelas samtidigt, var och en i en slinga och utan ljud. Filmerna och stillbilderna ligger i
// src/devtools/video och hämtas direkt från dev-servern (inte via import eller public), så att de inte följer med i en
// vanlig build. Utanför testläget visas inte komponenten alls. De är prydnad och har ingen alternativtext.
//
// `tilt` och `drop` gäller raden (version 1). Utspridda (version 2): alla är lika stora och ligger i en ring runt texten, två
// över (vid loggan), två på sidorna och två under. `cx` och `cy` är mitten på polaroiden: i sidled (från mitten av sidan)
// och i höjd (i fönstret).
const CLIPS = [
  { name: 'swim', tilt: -5, drop: '0.7rem', cx: 'calc(50% - 14rem)', cy: '21%' },
  { name: 'mat', tilt: 3, drop: '-0.5rem', cx: 'calc(50% + 17rem)', cy: '83%' },
  { name: 'spel', tilt: -2, drop: '0.9rem', cx: 'calc(50% - 17rem)', cy: '84%' },
  { name: 'dans', tilt: 4, drop: '-0.3rem', cx: 'calc(50% + 14rem)', cy: '20%' },
  { name: 'klattra', tilt: -4, drop: '0.6rem', cx: 'calc(50% - 27rem)', cy: '48%' },
  { name: 'katt', tilt: 2, drop: '-0.4rem', cx: 'calc(50% + 27rem)', cy: '51%' },
]

const file = (name, extension) => `/src/devtools/video/${name}.${extension}`

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function HomePolaroids({ scattered = false }) {
  // Den som har valt bort rörelse i systemet får bara stillbilderna.
  const still = reducedMotion()

  return (
    <ul className={`home-polaroids${scattered ? ' home-polaroids-scattered' : ''}`} aria-hidden="true">
      {CLIPS.map((clip, index) => (
        <li
          key={clip.name}
          className="home-polaroid"
          style={{ '--tilt': `${clip.tilt}deg`, '--drop': clip.drop, '--i': index, '--cx': clip.cx, '--cy': clip.cy }}
        >
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
