import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// En popup med rubrik och en stäng-knapp, byggd på det inbyggda <dialog>:
// Esc stänger, fokus stannar i rutan och sidan bakom blir overksam. Rendera den
// bara när den ska synas ({open && <Modal ...>}), den öppnas när den monteras.
// Ett klick på den mörka bakgrunden stänger också. Innehållet läggs i en portal
// på <body>, så att Enter i ett fält inte skickar ett formulär bakom popupen.
//
// `locked`: medan något pågår (t.ex. att kontot raderas) går popupen inte att
// stänga, varken med Stäng, ett klick bredvid eller Esc. Esc stänger annars
// <dialog> av sig själv, utan att fråga onClose, och då skulle popupen försvinna
// medan sidan tror att den är öppen (ett fel visas inte, och knappen som öppnar
// den slutar fungera).
function Modal({ title, onClose, locked = false, children }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const requestClose = () => {
    if (!lockedRef.current) onClose()
  }

  useEffect(() => {
    const dialog = dialogRef.current
    // close-händelsen skickas en stund efter att dialogen stängts. I utvecklingsläget
    // (React StrictMode) öppnas, stängs och öppnas dialogen igen direkt, och då
    // kommer händelsen från den första stängningen när dialogen redan är öppen
    // på nytt. Den ska inte stänga popupen, så bara en riktig stängning räknas.
    const handleClose = () => {
      if (!dialog.open) onCloseRef.current()
    }
    // Esc skickar cancel innan dialogen stängs: stoppa den medan popupen är låst.
    const handleCancel = (event) => {
      if (lockedRef.current) event.preventDefault()
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    dialog.showModal()
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
      dialog.close()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="card modal"
      aria-label={title}
      onClick={(e) => {
        if (e.target === dialogRef.current) requestClose()
      }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="text-button" onClick={requestClose} disabled={locked}>
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
