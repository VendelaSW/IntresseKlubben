import { useEffect } from 'react'

// Stänger något som är utfällt (en ruta under en tagg) när man trycker utanför
// `ref` eller trycker Esc. Gör inget medan `open` är false. Används av
// intressetaggarnas rutor (InterestTagGroup och Intressebiblioteket).
export function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined
    const onEvent = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', onEvent)
    document.addEventListener('keydown', onEvent)
    return () => {
      document.removeEventListener('pointerdown', onEvent)
      document.removeEventListener('keydown', onEvent)
    }
  }, [ref, open, close])
}
