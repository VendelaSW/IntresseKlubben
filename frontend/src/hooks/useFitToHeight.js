import { useLayoutEffect } from 'react'

// Ett formulär i blocket på kartan (t.ex. skapa klubb) ska få plats utan att man
// scrollar, på alla datorskärmar. Får det inte plats krymps hela formuläret lika
// mycket åt alla håll (CSS zoom), precis så mycket som behövs, så att det ser
// likadant ut fast mindre. Aldrig mindre än MIN_ZOOM, och bara när formuläret är
// brett (dator): på mobil ligger fälten under varandra och då scrollar man som vanligt.
// `ref` är formuläret (eller kortet runt det, som i Redigera profil), och blocket är
// närmaste .map-pad-page. Med `enabled` false krymps ingenting.
const MIN_ZOOM = 0.75
// Samma gräns som när sektionerna läggs i spalter (@container (min-width: 48rem)).
const WIDE = 768

export function useFitToHeight(ref, enabled = true) {
  useLayoutEffect(() => {
    const form = ref.current
    const page = form?.closest('.map-pad-page')
    if (!enabled || !page) return undefined
    let frame = 0

    function fit() {
      form.style.zoom = ''
      if (form.clientWidth < WIDE) return
      const overflow = page.scrollHeight - page.clientHeight
      if (overflow <= 0) return
      // Formuläret i full storlek, och hur mycket av det som får plats (lite marginal för avrundning).
      const height = form.getBoundingClientRect().height
      form.style.zoom = String(Math.max(MIN_ZOOM, (height - overflow - 2) / height))
    }

    // Om igen när blocket ändrar storlek (fönstret) eller formuläret gör det (t.ex. ett felmeddelande).
    const refit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    }
    fit()
    const observer = new ResizeObserver(refit)
    observer.observe(page)
    observer.observe(form)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      form.style.zoom = ''
    }
  }, [ref, enabled])
}
