import { useEffect, useRef } from 'react'
import kompis from '../assets/kompis.webp'
import ogonHoger from '../assets/kompis-ogon-hoger.png'
import ogonVanster from '../assets/kompis-ogon-vanster.png'
import pupillHoger from '../assets/pupill-hoger.webp'
import pupillVanster from '../assets/pupill-vanster.webp'

// Intressekompisen med pupiller som följer muspekaren. Fyller bredden på sin förälder (eller `width`) och behåller
// bildens proportioner, så den går att lägga var som helst: <Intressekompis />. Ingen CSS-fil behövs.
//
// Props:
//   width      CSS-bredd, t.ex. "320px" eller "min(92vw, 560px)". Standard "100%" (förälderns bredd).
//   className  läggs på ytterbehållaren, t.ex. för marginal eller placering.
//   alt        bildtext. Standard "Intressekompisen".
//
// Kompisbilden har tomma ögonvitor. Pupillerna ligger i var sin ruta över ögonvitan, och rutan klipps med en mask
// (kompis-ogon-*.png) som har ögonvitans exakta form, så att pupillen glider precis inuti hålet och aldrig sticker ut
// över kanten eller glasögonbågen. Maskerna är ritade ur just den här bilden; byts bilden måste de göras om och
// måtten nedan mätas om.
//
// Måtten nedan är i pixlar på originalbilden (1122 x 1402). Bildfilerna är nedskalade för snabb laddning, men allt
// placeras i procent av bilden, så siffrorna gäller ändå.
const IMAGE = { width: 1122, height: 1402 }
const PUPIL = { width: 99, height: 119 }

// Ögonvitornas övre vänstra hörn och storlek.
const EYES = [
  { id: 'vanster', pupil: pupillVanster, mask: ogonVanster, x: 416, y: 343, width: 128, height: 143 },
  { id: 'hoger', pupil: pupillHoger, mask: ogonHoger, x: 682, y: 359, width: 130, height: 148 },
]

// Hur många pixlar pupillen sitter högre än ögats mitt, hela rörelsen igenom.
const PUPIL_UP = 6
// Hur långt pupillen får röra sig från mitten, som andel av ögats bredd.
const TRAVEL = 0.14
// Så långt bort (i ögonbredder) behöver musen vara för att pupillen ska nå ända ut.
const REACH = 4

const percentX = (px) => `${(px / IMAGE.width) * 100}%`
const percentY = (px) => `${(px / IMAGE.height) * 100}%`

function Intressekompis({ width = '100%', className, alt = 'Intressekompisen' }) {
  const eyeRefs = useRef({})
  const pupilRefs = useRef({})

  useEffect(() => {
    // Den som har valt mindre rörelse får pupiller som står still.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    function look(clientX, clientY) {
      for (const eye of EYES) {
        const box = eyeRefs.current[eye.id]?.getBoundingClientRect()
        const pupil = pupilRefs.current[eye.id]
        if (!box || !pupil) continue
        // Från ögats mitt till muspekaren.
        const dx = clientX - (box.left + box.width / 2)
        const dy = clientY - (box.top + box.height / 2)
        const distance = Math.hypot(dx, dy)
        // Närmare än så rör sig pupillen mindre, längre bort når den full längd åt det hållet.
        const strength = Math.min(distance / (box.width * REACH), 1)
        const travel = box.width * TRAVEL * strength
        const x = distance === 0 ? 0 : (dx / distance) * travel
        const y = distance === 0 ? 0 : (dy / distance) * travel
        pupil.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
      }
    }

    const onPointerMove = (event) => look(event.clientX, event.clientY)
    // Muspekaren lämnar fönstret: pupillerna tittar rakt fram igen.
    const onLeave = () => {
      for (const eye of EYES) {
        const pupil = pupilRefs.current[eye.id]
        if (pupil) pupil.style.transform = 'translate(-50%, -50%)'
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div className={className} style={{ position: 'relative', width, aspectRatio: `${IMAGE.width} / ${IMAGE.height}` }}>
      <img src={kompis} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {EYES.map((eye) => (
        <div
          key={eye.id}
          ref={(el) => {
            eyeRefs.current[eye.id] = el
          }}
          style={{
            position: 'absolute',
            left: percentX(eye.x),
            top: percentY(eye.y),
            width: percentX(eye.width),
            height: percentY(eye.height),
            // Klipper pupillen till ögonvitans exakta form.
            WebkitMaskImage: `url(${eye.mask})`,
            maskImage: `url(${eye.mask})`,
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}
        >
          <img
            ref={(el) => {
              pupilRefs.current[eye.id] = el
            }}
            src={eye.pupil}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              top: `${50 - (PUPIL_UP / eye.height) * 100}%`,
              width: `${(PUPIL.width / eye.width) * 100}%`,
              height: `${(PUPIL.height / eye.height) * 100}%`,
              transform: 'translate(-50%, -50%)',
              transition: 'transform 90ms ease-out',
            }}
          />
        </div>
      ))}
    </div>
  )
}

export default Intressekompis
