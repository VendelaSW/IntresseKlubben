import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// En popup med rubrik och en stäng-knapp, byggd på det inbyggda <dialog>:
// Esc stänger, fokus stannar i rutan och sidan bakom blir overksam. Rendera den
// bara när den ska synas ({open && <Modal ...>}), den öppnas när den monteras.
// Ett klick på den mörka bakgrunden stänger också. Innehållet läggs i en portal
// på <body>, så att Enter i ett fält inte skickar ett formulär bakom popupen.
function Modal({ title, onClose, children }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    // close-händelsen skickas en stund efter att dialogen stängts. I utvecklingsläget
    // (React StrictMode) öppnas, stängs och öppnas dialogen igen direkt, och då
    // kommer händelsen från den första stängningen när dialogen redan är öppen
    // på nytt. Den ska inte stänga popupen, så bara en riktig stängning räknas.
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
      className="card modal"
      aria-label={title}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Stäng
          </button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  )
}

export default Modal
