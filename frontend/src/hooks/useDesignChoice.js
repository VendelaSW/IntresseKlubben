import { useSyncExternalStore } from 'react'

// TILLFÄLLIGT: vilket utseende som är valt i testpanelen för något som jämförs (se
// devtools/PadBackgroundPicker.jsx), t.ex. useDesignChoice('clubCard'). Valet ligger som ett data-attribut på
// <html> (data-club-card="3"). Utan val, och alltid utanför testläget (där finns ingen testpanel som sätter
// attributen), är svaret 'pre-dev': utseendet som gäller nu. Tas bort när utseendena är valda.
export const PRE_DEV = 'pre-dev'

function subscribe(onChange) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true })
  return () => observer.disconnect()
}

export function useDesignChoice(attr) {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset[attr] ?? PRE_DEV)
}
