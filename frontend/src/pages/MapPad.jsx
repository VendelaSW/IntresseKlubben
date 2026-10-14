import { useEffect, useState } from 'react'

// Hur länge blocket lyfter innan det tas bort (samma som .map-pad.is-leaving).
const LEAVE_MS = 260

// Ett anteckningsblock som läggs ned på kartan, som om kartan låg på ett bord
// och man lade ett block ovanpå. Blocket faller in, landar med en liten studs
// och lutar lite, som bordet. "Stäng", Escape eller ett klick bredvid lyfter
// bort det igen. `wide` ger ett bredare block, för sidor med kort i rutnät
// (Brev, Personer, Klubbar, Events).
function MapPad({ title, wide = false, onClose, children }) {
  const [leaving, setLeaving] = useState(false)

  // Lyft blocket och ta bort det när det har lyft.
  function close() {
    if (leaving) return
    setLeaving(true)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTimeout(onClose, reduceMotion ? 0 : LEAVE_MS)
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  return (
    // Ett klick på bordet bredvid blocket lyfter bort det.
    <div className="map-pad-stage" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section
        className={`map-pad${wide ? ' is-wide' : ''}${leaving ? ' is-leaving' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-pad-title"
      >
        <div className="map-pad-rings" aria-hidden="true" />
        <div className="map-pad-page">
          <div className="map-pad-head">
            <h2 id="map-pad-title" className="map-pad-title">
              {title}
            </h2>
            <button type="button" className="map-pad-close" onClick={close} aria-label="Stäng">
              ×
            </button>
          </div>
          {children}
        </div>
      </section>
    </div>
  )
}

export default MapPad
