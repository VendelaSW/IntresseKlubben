import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// PROTOTYP, steg 1: den underliggande kartan. Vektordata från OpenFreeMap
// (gratis, ingen API-nyckel) med deras färdiga ljusa stil, helt orörd.
// Nästa steg: egen stil (skala bort detaljer), sedan handritat lager ovanpå.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const GUSTAVSBERG = [18.389, 59.326] // [longitud, latitud]

function MapPrototype() {
  const containerRef = useRef(null)

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: GUSTAVSBERG,
      zoom: 13,
    })
    map.addControl(new NavigationControl(), 'top-right')
    return () => map.remove()
  }, [])

  return (
    <div className="map-prototype">
      <div ref={containerRef} className="map-prototype-canvas" />
    </div>
  )
}

export default MapPrototype
