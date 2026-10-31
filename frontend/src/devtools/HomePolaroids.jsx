import { useEffect, useRef, useState } from 'react'
import './homePolaroids.css'

// TILLFÄLLIGT, bara i testläget: filmerna på startsidan som polaroider (väljaren "Förstasidan", se Home och
// homePolaroids.css). De spelas samtidigt, var och en i en slinga och utan ljud. Filmerna och stillbilderna ligger i
// src/devtools/video och hämtas direkt från dev-servern (inte via import eller public), så att de inte följer med i en
// vanlig build. Utanför testläget visas inte komponenten alls. De är prydnad och har ingen alternativtext.
//
// De första sex är med i alla varianter. De fyra sista är bara med i kollaget (version 3) på en bred skärm.
// `tilt` och `drop` gäller raden (version 1). `ring` är placeringen i ringen runt texten (version 2) och `collage` i kollaget
// (version 3): `cx` och `cy` är mitten på polaroiden, i sidled (från mitten av sidan) och i höjd (i fönstret). `max(...)` på de
// yttre håller dem synliga också på en smal skärm; en negativ sida (längre ut än kanten) skulle klippa dem.
const CLIPS = [
  { name: 'swim', tilt: -5, drop: '0.7rem', ring: ['calc(50% - 14rem)', '21%'], collage: ['calc(50% - 15rem)', '21%'] },
  { name: 'mat', tilt: 3, drop: '-0.5rem', ring: ['calc(50% + 17rem)', '83%'], collage: ['calc(50% + 18rem)', '84%'] },
  { name: 'spel', tilt: -2, drop: '0.9rem', ring: ['calc(50% - 17rem)', '84%'], collage: ['calc(50% - 18rem)', '85%'] },
  { name: 'dans', tilt: 4, drop: '-0.3rem', ring: ['calc(50% + 14rem)', '20%'], collage: ['calc(50% + 15rem)', '19%'] },
  { name: 'klattra', tilt: -4, drop: '0.6rem', ring: ['calc(50% - 27rem)', '48%'], collage: ['calc(50% - 26rem)', '49%'] },
  { name: 'katt', tilt: 2, drop: '-0.4rem', ring: ['calc(50% + 27rem)', '51%'], collage: ['calc(50% + 27rem)', '53%'] },
  { name: 'gaming', tilt: -3, drop: '0.4rem', collage: ['max(5rem, calc(50% - 35rem))', '15%'] },
  { name: 'origami', tilt: 5, drop: '-0.6rem', collage: ['max(5rem, calc(50% - 35rem))', '78%'] },
  { name: 'spa', tilt: -4, drop: '0.5rem', collage: ['min(calc(100% - 5rem), calc(50% + 35rem))', '80%'] },
  { name: 'saxo', tilt: 4, drop: '-0.3rem', collage: ['min(calc(100% - 5rem), calc(50% + 35rem))', '14%'] },
]
const BASE_COUNT = 6
// Hur många som ligger i raden (version 1) på en bred skärm (laptop). På en smal skärm är det BASE_COUNT.
const ROW_COUNT = 8

const file = (name, extension) => `/src/devtools/video/${name}.${extension}`

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Sant när fönstret är minst så brett (och följer fönstret när det ändras).
function useMinWidth(width) {
  const query = `(min-width: ${width}px)`
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}

function HomePolaroids({ scattered = false, collage = false }) {
  // Den som har valt bort rörelse i systemet får bara stillbilderna.
  const still = reducedMotion()
  const wide = useMinWidth(1100)
  const mobile = !useMinWidth(601)
  // Alla tio i kollaget på en bred skärm, annars de sex första (färre filmer som spelar på en mobil).
  const showAll = collage && wide
  // Raden (version 1) får fler polaroider på en bred skärm; ringen (version 2) har sex. På en mobil är det åtta runt loggan.
  const count = showAll ? CLIPS.length : mobile || (wide && !scattered) ? ROW_COUNT : BASE_COUNT
  const clips = CLIPS.slice(0, count)

  // Filmerna spelar bara medan de syns: de pausas när sidan är scrollad förbi dem eller fliken är dold, så att de inte
  // belastar datorn eller telefonen i onödan.
  const videos = useRef([])
  useEffect(() => {
    if (still) return undefined
    const inView = new Set()
    const sync = () =>
      videos.current.forEach((video) => {
        if (!video) return
        if (inView.has(video) && !document.hidden) video.play().catch(() => {})
        else video.pause()
      })
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? inView.add(entry.target) : inView.delete(entry.target)))
        sync()
      },
      { threshold: 0.1 },
    )
    videos.current.forEach((video) => video && observer.observe(video))
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [still, count])

  return (
    <ul
      className={`home-polaroids${scattered ? ' home-polaroids-scattered' : ''}${showAll ? ' home-polaroids-collage' : ''}`}
      aria-hidden="true"
    >
      {clips.map((clip, index) => {
        const [cx, cy] = (showAll ? clip.collage : clip.ring) ?? clip.collage
        return (
          <li
            key={clip.name}
            className="home-polaroid"
            style={{ '--tilt': `${clip.tilt}deg`, '--drop': clip.drop, '--i': index, '--cx': cx, '--cy': cy }}
          >
            <video
              ref={(element) => {
                videos.current[index] = element
              }}
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
        )
      })}
    </ul>
  )
}

export default HomePolaroids
