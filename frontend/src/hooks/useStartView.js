import { useEffect, useState } from 'react'

// Vad /hem visar: 'karta' (kartan, standard) eller 'klassisk' (appens vanliga
// startsida med menyn). Valet görs med "Avsluta kartan" på kartan och "Visa
// kartan" i appens meny, och sparas i webbläsaren. Går det inte (t.ex. privat
// läge) gäller valet tills sidan laddas om.
const KEY = 'startvy'
const CHANGED = 'startvy-changed'
let remembered = null

export function getStartView() {
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored) return stored === 'klassisk' ? 'klassisk' : 'karta'
  } catch {
    // Se ovan.
  }
  return remembered ?? 'karta'
}

export function setStartView(view) {
  remembered = view
  try {
    window.localStorage.setItem(KEY, view)
  } catch {
    // Se ovan.
  }
  window.dispatchEvent(new Event(CHANGED))
}

// Det aktuella valet, som uppdateras när det ändras (även i en annan flik).
export function useStartView() {
  const [view, setView] = useState(getStartView)
  useEffect(() => {
    const update = () => setView(getStartView())
    window.addEventListener(CHANGED, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(CHANGED, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return view
}
