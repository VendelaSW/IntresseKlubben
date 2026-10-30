import { useEffect, useRef, useState } from 'react'
import './homePolaroids.css'

// TILLFÄLLIGT, bara i testläget: filmerna på startsidan som polaroider (väljaren "Förstasidan", se Home och
// homePolaroids.css). De spelas en i taget i en slinga, utan ljud; de som väntar visar sin stillbild. Filmerna och
// stillbilderna ligger i src/devtools/video och hämtas direkt från dev-servern (inte via import eller public), så att de
// inte följer med i en vanlig build. Utanför testläget visas inte komponenten alls. De är prydnad och har ingen
// alternativtext.
const CLIPS = [
  { name: 'swim', tilt: -5, drop: '0.7rem' },
  { name: 'mat', tilt: 3, drop: '-0.5rem' },
  { name: 'spel', tilt: -2, drop: '0.9rem' },
  { name: 'dans', tilt: 4, drop: '-0.3rem' },
  { name: 'klattra', tilt: -4, drop: '0.6rem' },
  { name: 'katt', tilt: 2, drop: '-0.4rem' },
]

const file = (name, extension) => `/src/devtools/video/${name}.${extension}`

// Den som har valt bort rörelse i systemet får bara stillbilderna.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function HomePolaroids() {
  const videos = useRef([])
  // Vilken film som spelas just nu.
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (reducedMotion()) return
    videos.current.forEach((video, index) => {
      if (!video) return
      if (index === active) {
        video.currentTime = 0
        // Stoppar webbläsaren uppspelningen går det vidare till nästa film.
        video.play().catch(() => setActive((current) => (current + 1) % CLIPS.length))
      } else if (video.currentTime > 0) {
        // load() ställer tillbaka filmen så att stillbilden syns igen.
        video.load()
      }
    })
  }, [active])

  return (
    <ul className="home-polaroids" aria-hidden="true">
      {CLIPS.map((clip, index) => (
        <li key={clip.name} className="home-polaroid" style={{ '--tilt': `${clip.tilt}deg`, '--drop': clip.drop, '--i': index }}>
          <video
            ref={(element) => {
              videos.current[index] = element
            }}
            src={file(clip.name, 'mp4')}
            poster={file(clip.name, 'jpg')}
            muted
            playsInline
            preload="auto"
            tabIndex={-1}
            onEnded={() => setActive((current) => (current + 1) % CLIPS.length)}
          />
        </li>
      ))}
    </ul>
  )
}

export default HomePolaroids
