import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'

// Under den här bredden blir rutan ett ark nedifrån (samma gräns som Medlemmars filter).
const NARROW = '(max-width: 767px)'

// Rutan med underintressen till en intressetagg (InterestTagGroup och bibliotekets PickGroup). `children` är taggarna,
// som <li>. Med `pageHref` står länken "Om {title} ›" till intressets sida (SCRUM-306) först. Rendera den bara när den
// ska synas; `onClose` stänger den.
//
// På bred skärm en ruta under taggen, som en lapp (.interest-tag-panel), som scrollas fram när den öppnas. På en smal
// skärm ett ark nedifrån (InterestSheet), eftersom rutan där täcktes av taggarna under eller klipptes av skärmens kant.
function InterestTagPanel({ id, title, pageHref, onClose, children }) {
  const narrow = useMediaQuery(NARROW)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!narrow) panelRef.current?.scrollIntoView({ block: 'nearest' })
  }, [narrow])

  const about = pageHref && (
    <Link to={pageHref} className="interest-tag-panel-about">
      Om {title} ›
    </Link>
  )

  if (narrow) {
    return (
      <InterestSheet id={id} title={title} about={about} onClose={onClose}>
        {children}
      </InterestSheet>
    )
  }
  return (
    <ul ref={panelRef} id={id} className="interest-tag-panel">
      {about && <li className="interest-tag-panel-about-row">{about}</li>}
      {children}
    </ul>
  )
}

// Arket: ett <dialog> som ligger över allt annat (också kartans block) och tar högst en del av skärmen. Listan scrollar
// i arket när den är lång. Stängs med ×, ett tryck på den mörka bakgrunden eller Esc, som Modal. Arket ligger kvar i
// taggens <li> (ingen portal), så att ett tryck i det räknas som inuti taggen (se useDismiss).
function InterestSheet({ id, title, about, onClose, children }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = dialogRef.current
    // Bara en riktig stängning räknas, inte den från React StrictMode i utvecklingsläget (se Modal).
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

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="interest-sheet"
      aria-label={title}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="interest-sheet-content">
        <div className="interest-sheet-head">
          <h3 className="interest-sheet-title">{title}</h3>
          <button type="button" className="interest-sheet-close" aria-label="Stäng" onClick={onClose}>
            ×
          </button>
        </div>
        {about}
        <ul className="interest-tags interest-sheet-list">{children}</ul>
      </div>
    </dialog>
  )
}

export default InterestTagPanel
