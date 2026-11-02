import { useSyncExternalStore } from 'react'

// Stämmer media-frågan (t.ex. '(max-width: 767px)') just nu? Uppdateras när skärmen ändras, t.ex. när telefonen vrids.
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
