import { useSyncExternalStore } from 'react'

// TILLFÄLLIGT: vilket utseende som är valt i testpanelen för något som jämförs (se
// devtools/PadBackgroundPicker.jsx), t.ex. useDesignChoice('clubCard'). Valet ligger som ett data-attribut på
// <html> (data-club-card="3"). Utanför testläget kommer valen från app/chosenDesign.js. Utan val är svaret 'pre-dev'.
// Tas bort när de andra utseendena är borttagna.
export const PRE_DEV = 'pre-dev'

function subscribe(onChange) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true })
  return () => observer.disconnect()
}

export function useDesignChoice(attr) {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset[attr] ?? PRE_DEV)
}
