import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// En liten i-ikon med en förklaring (SCRUM-315), i stället för en hjälptext som alltid tar plats. Förklaringen syns när
// man håller muspekaren över ikonen, när man tabbar till den och när man trycker på den, och den läses upp av
// skärmläsare. Rutan ligger i webbläsarens översta lager (popover), så att den inte klipps av blocket eller en popup.
function InfoTip({ text }) {
  const [open, setOpen] = useState(false)
  // Tryckt på (inte bara muspekaren över): då stängs den inte när pekaren lämnar ikonen.
  const pinned = useRef(false)
  const buttonRef = useRef(null)
  const bubbleRef = useRef(null)

  function close() {
    pinned.current = false
    setOpen(false)
  }

  useLayoutEffect(() => {
    if (!open) return
    const bubble = bubbleRef.current
    bubble.showPopover?.()
    const icon = buttonRef.current.getBoundingClientRect()
    const { width, height } = bubble.getBoundingClientRect()
    const margin = 8
    const below = icon.bottom + 6
    const top = below + height > window.innerHeight - margin ? icon.top - height - 6 : below
    bubble.style.top = `${Math.max(margin, top)}px`
    bubble.style.left = `${Math.max(margin, Math.min(icon.left + icon.width / 2 - width / 2, window.innerWidth - width - margin))}px`
  }, [open])

  // Rutan står still medan sidan rör sig, så den stängs när man scrollar.
  useEffect(() => {
    if (!open) return undefined
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  return (
    <span className="info-tip">
      <button
        ref={buttonRef}
        type="button"
        className="info-tip-button"
        aria-label={`Förklaring: ${text}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned.current && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => {
          pinned.current = !pinned.current
          setOpen(pinned.current)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            // Bara förklaringen, inte vidare till ett öppet block eller en popup.
            event.stopPropagation()
            event.preventDefault()
            close()
          }
        }}
      >
        {/* Ett ritat litet i, så att det inte ser ut som ett I eller ett snedstreck i något typsnitt. */}
        <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
          <circle cx="8" cy="3.9" r="1.3" fill="currentColor" />
          <path d="M8 7.8v4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <span ref={bubbleRef} className="info-tip-bubble" popover="manual" aria-hidden="true">
          {text}
        </span>
      )}
    </span>
  )
}

export default InfoTip
