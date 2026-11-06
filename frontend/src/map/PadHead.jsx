import { createContext, useContext, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Blockets rubrikrad (se MapPad), för sidorna i blocket: `actions` är platsen bredvid rubriken, `float` en plats
// nere i blockets högra hörn som ligger kvar över innehållet när man scrollar (t.ex. "+ Skapa klubb"), och
// `setBack` gör rubriken till en tillbaka-knapp ("← Klubbar"). Utanför ett block finns ingen rubrikrad, och då
// ritas knapparna där de står på sidan.
export const PadHeadContext = createContext(null)

// Lägger `children` i blockets rubrikrad, bredvid rubriken. Utanför ett block: där de står.
export function PadHeadAction({ children }) {
  const head = useContext(PadHeadContext)
  if (!head?.actions) return children
  return createPortal(children, head.actions)
}

// Lägger `children` flytande nere i blockets högra hörn, ovanpå innehållet. Utanför ett block: där de står.
export function PadFloatAction({ children }) {
  const head = useContext(PadHeadContext)
  if (!head?.float) return children
  return createPortal(children, head.float)
}

// Gör blockets rubrik till en tillbaka-knapp så länge komponenten visas. Svarar false utanför ett block,
// så att sidan kan visa en egen knapp i stället.
export function usePadBack(onBack) {
  const head = useContext(PadHeadContext)
  const latest = useRef(onBack)
  latest.current = onBack
  const setBack = head?.setBack

  useEffect(() => {
    if (!setBack) return undefined
    setBack(() => () => latest.current())
    return () => setBack(null)
  }, [setBack])

  return Boolean(setBack)
}
