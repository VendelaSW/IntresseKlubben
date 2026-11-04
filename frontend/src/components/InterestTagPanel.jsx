import { useLayoutEffect, useRef } from 'react'

// Rutan med underintressen till en intressetagg (InterestTagGroup och bibliotekets PickGroup), samma på mobil och dator
// (SCRUM-306). `children` är taggarna, som <li>. Rendera den bara när den ska synas.
//
// Rutan ligger över taggarna under, så att inget flyttar sig, och scrollar själv när listan är lång (se
// .interest-tag-panel). Den börjar under taggen men flyttas åt vänster om den annars skulle gå utanför raden med
// taggar, t.ex. för en tagg längst till höger, så att den aldrig klipps av skärmens kant.
function InterestTagPanel({ id, children }) {
  const panelRef = useRef(null)

  // Mätt med offset-mått, inte getBoundingClientRect: kartans block lutar lite, och då stämmer inte skärmens mått.
  useLayoutEffect(() => {
    const panel = panelRef.current
    const tag = panel.parentElement
    const row = tag.closest('ul')
    if (!row) return
    // Aldrig bredare än raden, och inte heller bredare än i CSS:en.
    const cssMax = parseFloat(getComputedStyle(panel).maxWidth) || Infinity
    panel.style.maxWidth = `${Math.min(row.clientWidth, cssMax)}px`
    const tagLeft = tag.offsetParent === row ? tag.offsetLeft : tag.offsetLeft - row.offsetLeft
    const overflow = tagLeft + panel.offsetWidth - row.clientWidth
    if (overflow > 0) panel.style.left = `${-Math.min(overflow, tagLeft)}px`
    panel.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <ul ref={panelRef} id={id} className="interest-tag-panel">
      {children}
    </ul>
  )
}

export default InterestTagPanel
