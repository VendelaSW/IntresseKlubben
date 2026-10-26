import { useEffect, useMemo, useState } from 'react'
import { PadHeadContext } from '../components/PadHead'
import { PRE_DEV, useDesignChoice } from '../hooks/useDesignChoice'

// Hur länge blocket lyfter innan det tas bort (samma som .map-pad.is-leaving).
const LEAVE_MS = 260

// Ett anteckningsblock som läggs ned på kartan, som om kartan låg på ett bord
// och man lade ett block ovanpå. Blocket faller in, landar med en liten studs
// och lutar lite, som bordet. "Stäng", Escape eller ett klick bredvid lyfter
// bort det igen. `wide` ger ett bredare block, för sidor med kort i rutnät
// (Brev, Personer, Klubbar, Events).
// TILLFÄLLIGT: med den nya rubriken i testläget (useDesignChoice('padHead')) kan sidorna i blocket lägga knappar i
// rubrikraden och göra rubriken till en tillbaka-knapp (se PadHead.jsx). Annars, och utanför testläget, står de
// där de står på sidan, som vanligt.
function MapPad({ title, wide = false, onClose, children }) {
  const [leaving, setLeaving] = useState(false)
  const newHead = useDesignChoice('padHead') !== PRE_DEV
  const [actions, setActions] = useState(null)
  const [float, setFloat] = useState(null)
  const [back, setBack] = useState(null)
  const head = useMemo(() => (newHead ? { actions, float, setBack } : null), [newHead, actions, float])

  // Lyft blocket och ta bort det när det har lyft.
  function close() {
    if (leaving) return
    setLeaving(true)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTimeout(onClose, reduceMotion ? 0 : LEAVE_MS)
  }

  useEffect(() => {
    function onKeyDown(event) {
      // En popup (Modal) ovanpå blocket stänger sig själv med Escape; blocket ska ligga kvar.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) close()
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
              {newHead && back ? (
                <button type="button" className="map-pad-back" onClick={back} aria-label={`Tillbaka till ${title}`}>
                  <span aria-hidden="true">←</span> {title}
                </button>
              ) : (
                title
              )}
            </h2>
            {newHead && <div ref={setActions} className="map-pad-head-actions" />}
            <button type="button" className="map-pad-close" onClick={close} aria-label="Stäng">
              ×
            </button>
          </div>
          <PadHeadContext.Provider value={head}>{children}</PadHeadContext.Provider>
        </div>
        {/* Knappar som flyter nere i högra hörnet, utanför sidan som scrollar (se PadFloatAction). */}
        {newHead && <div ref={setFloat} className="map-pad-float" />}
      </section>
    </div>
  )
}

export default MapPad
