import { useLayoutEffect, useRef } from 'react'
import Intressekompis from './Intressekompis'

// En tom lista: Intressekompisen med en handritad lapp bredvid, som en pratbubbla, där det står att det är tomt och
// vad sidan är till för (`text`). `children` är en knapp vidare, t.ex. "Se alla klubbar". `compact` ger en mindre
// variant, för en del av en sida (t.ex. Skickade under Förfrågningar). Används i alla block (Brev, Personer,
// Klubbar, Events och Notiser), så att en tom sida ser likadan ut överallt.
function EmptyState({ text, title = 'Här var det tomt', compact = false, children }) {
  const ref = useRef(null)
  useSteadyPlace(ref, !compact)

  return (
    <div ref={ref} className={`empty-state${compact ? ' is-compact' : ''}`}>
      <div className="empty-state-kompis" aria-hidden="true">
        <Intressekompis alt="" />
      </div>
      <div className="paper-note empty-state-note">
        <p className="empty-state-title">{title}</p>
        <p className="empty-state-text">{text}</p>
        {children && <div className="empty-state-action">{children}</div>}
      </div>
    </div>
  )
}

// I ett block (.map-pad-page) står kompisen mitt i blocket, på samma höjd oavsett vad som är ovanför (flikar,
// filter eller ingenting), så att han inte hoppar när man byter mellan t.ex. Events och Notiser. Marginalen ovanför
// räknas ut efter varje utritning och när blocket eller lappen ändrar storlek. Räcker inte platsen under flikarna
// och filtren hamnar han direkt under dem, som vanligt.
function useSteadyPlace(ref, enabled) {
  useLayoutEffect(() => {
    const el = ref.current
    const page = el?.closest('.map-pad-page')
    if (!enabled || !page) return undefined

    function place() {
      el.style.marginTop = ''
      const kompis = el.firstElementChild.getBoundingClientRect()
      const top = page.getBoundingClientRect().top + page.clientTop - page.scrollTop
      const extra = page.clientHeight / 2 - (kompis.top + kompis.height / 2 - top)
      if (extra > 0) el.style.marginTop = `${parseFloat(getComputedStyle(el).marginTop) + extra}px`
    }

    place()
    const observer = new ResizeObserver(place)
    observer.observe(page)
    observer.observe(el)
    return () => {
      observer.disconnect()
      el.style.marginTop = ''
    }
  })
}

export default EmptyState
