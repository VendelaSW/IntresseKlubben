import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Matchningen som en ruta ovanpå hela sidan (layouten Nicklas förslag 1): ingen scrollning på sidan, kortet får plats i
// skärmen och bara Om mig-texten inuti kortet scrollar om den är lång (se .match-overlay i index.css). Byggd på det
// inbyggda <dialog>, som Modal: Esc stänger, fokus stannar i rutan och sidan bakom blir overksam. Rendera den bara när den
// ska synas ({open && <MatchOverlay ...>}). Ett klick på den mörka bakgrunden stänger också, liksom krysset. Innehållet
// ligger i en portal på <body>, så att inget bakom påverkas.
function MatchOverlay({ onClose, children }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    // Som i Modal: bara en riktig stängning räknas (i utvecklingsläget öppnas, stängs och öppnas dialogen direkt igen).
    const handleClose = () => {
      if (!dialog.open) onCloseRef.current()
    }
    dialog.addEventListener('close', handleClose)
    dialog.showModal()
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.close()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="match-overlay"
      aria-label="Matcha"
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <button type="button" className="match-overlay-close" aria-label="Stäng matchningen" onClick={onClose}>
        ×
      </button>
      {children}
    </dialog>,
    document.body,
  )
}

export default MatchOverlay
