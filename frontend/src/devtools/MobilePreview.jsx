import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Snabbkollen av bredd i testläget: appen i en ram med en telefons storlek, ovanpå sidan. Ramen är ett eget
// fönster, så appens mobil-CSS (media queries) slår till, och den delar inloggning med sidan. Mer än bredden går
// inte att få så här (inte pekskärm, telefonens webbläsare, tangentbordet, adressfältet eller notchen): testa på
// en riktig telefon för det, med `npm run dev:telefon`.
export const SIZES = [
  { id: 'liten', label: 'Liten mobil', width: 375, height: 667 },
  { id: 'mobil', label: 'Mobil', width: 390, height: 844 },
  { id: 'surfplatta', label: 'Surfplatta', width: 768, height: 1024 },
]

// Luft runt ramen och verktygsraden ovanför den, i px.
const MARGIN = 24
const TOOLBAR = 72

function fitScale(size) {
  const scale = Math.min((window.innerHeight - TOOLBAR - 2 * MARGIN) / size.height, (window.innerWidth - 2 * MARGIN) / size.width)
  return Math.min(1, scale)
}

function MobilePreview({ sizeId, onSizeChange, onClose }) {
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0]
  const location = useLocation()
  const navigate = useNavigate()
  const frame = useRef(null)
  // Ramen börjar på sidan man står på, och byter inte adress när sidan bakom gör det.
  const [src] = useState(() => location.pathname + location.search)
  const [scale, setScale] = useState(() => fitScale(size))

  useEffect(() => {
    const update = () => setScale(fitScale(size))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [size])

  // Stänger man mobilvyn hamnar sidan bakom där man var i ramen.
  function close() {
    try {
      const { pathname, search } = frame.current.contentWindow.location
      navigate(pathname + search)
    } catch {
      // Ramen har inte laddat klart: stanna där man är.
    }
    onClose()
  }

  return (
    <div className="dev-mobile" role="dialog" aria-label="Mobilvy">
      <div className="dev-mobile-toolbar">
        {SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === size.id ? 'is-active' : undefined}
            aria-pressed={s.id === size.id}
            onClick={() => onSizeChange(s.id)}
          >
            {s.label} ({s.width})
          </button>
        ))}
        <button type="button" onClick={() => frame.current?.contentWindow.location.reload()}>
          Ladda om
        </button>
        <button type="button" onClick={close}>
          Stäng
        </button>
        <p className="dev-mobile-note">Bara bredden. Pekskärm och telefonens webbläsare: npm run dev:telefon</p>
      </div>
      <div className="dev-mobile-device" style={{ width: size.width * scale, height: size.height * scale }}>
        <iframe
          ref={frame}
          title="Appen i mobilstorlek"
          src={src}
          style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  )
}

export default MobilePreview
