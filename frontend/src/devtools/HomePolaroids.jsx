import './homePolaroids.css'

// TILLFÄLLIGT, bara i testläget: filmerna på startsidan som polaroider (väljaren "Förstasidan", se Home och
// homePolaroids.css). De spelas samtidigt, var och en i en slinga och utan ljud. Filmerna och stillbilderna ligger i
// src/devtools/video och hämtas direkt från dev-servern (inte via import eller public), så att de inte följer med i en
// vanlig build. Utanför testläget visas inte komponenten alls. De är prydnad och har ingen alternativtext.
// `tilt` och `drop` gäller raden (version 1). Utspridda (version 2): `side` och `x` är avståndet från vänster eller höger kant
// (negativt = sticker ut över kanten), `y` hur långt ner i fönstret och `w` bredden.
const CLIPS = [
  { name: 'swim', tilt: -5, drop: '0.7rem', side: 'left', x: '10%', y: '9%', w: 'clamp(7.5rem, 12vw, 11rem)' },
  { name: 'mat', tilt: 3, drop: '-0.5rem', side: 'left', x: '3%', y: '40%', w: 'clamp(8.5rem, 13vw, 12.5rem)' },
  { name: 'spel', tilt: -2, drop: '0.9rem', side: 'left', x: '17%', y: '68%', w: 'clamp(7.5rem, 11vw, 10.5rem)' },
  { name: 'dans', tilt: 4, drop: '-0.3rem', side: 'right', x: '16%', y: '7%', w: 'clamp(7.5rem, 11vw, 10.5rem)' },
  { name: 'klattra', tilt: -4, drop: '0.6rem', side: 'right', x: '3%', y: '38%', w: 'clamp(8.5rem, 13vw, 12.5rem)' },
  { name: 'katt', tilt: 2, drop: '-0.4rem', side: 'right', x: '11%', y: '67%', w: 'clamp(7.5rem, 12vw, 11rem)' },
]

const file = (name, extension) => `/src/devtools/video/${name}.${extension}`

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function HomePolaroids({ scattered = false }) {
  // Den som har valt bort rörelse i systemet får bara stillbilderna.
  const still = reducedMotion()

  return (
    <ul className={`home-polaroids${scattered ? ' home-polaroids-scattered' : ''}`} aria-hidden="true">
      {CLIPS.map((clip, index) => (
        <li key={clip.name} className="home-polaroid" style={{
            '--tilt': `${clip.tilt}deg`,
            '--drop': clip.drop,
            '--i': index,
            [`--${clip.side}`]: clip.x,
            '--y': clip.y,
            '--w': clip.w,
          }}>
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
