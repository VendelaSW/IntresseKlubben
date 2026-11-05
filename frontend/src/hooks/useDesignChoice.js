import { useSyncExternalStore } from 'react'

// Vilket utseende kartan har (se map/themes.js och devtools/PadBackgroundPicker.jsx). Valet ligger som ett data-attribut
// på <html>, t.ex. data-map-ground="kaffe". Utan val är svaret 'pre-dev'.
export const PRE_DEV = 'pre-dev'

function subscribe(onChange) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true })
  return () => observer.disconnect()
}

export function useDesignChoice(attr) {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset[attr] ?? PRE_DEV)
}
