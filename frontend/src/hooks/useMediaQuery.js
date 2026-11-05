import { useSyncExternalStore } from 'react'

// Gränsen mellan telefon och dator, samma som i CSS:en (`@media (max-width: 767px)`). Använd useIsMobile eller
// isMobile i stället för att skriva gränsen på flera ställen.
const MOBILE_QUERY = '(max-width: 767px)'

// Stämmer media-frågan (t.ex. '(min-width: 900px)') just nu? Uppdateras när skärmen ändras, t.ex. när telefonen vrids.
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

// Är skärmen telefonbred? Uppdateras när skärmen ändras, t.ex. när telefonen vrids.
export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY)
}

// Samma fråga en enda gång, för kod som inte ritar något (t.ex. när en sida scrollar).
export function isMobile() {
  return window.matchMedia(MOBILE_QUERY).matches
}
