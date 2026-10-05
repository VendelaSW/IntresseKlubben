import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addMissingDoodle } from './mapPrototypeDoodles'
import { attachPlaceNotes } from './mapPrototypeNotes'
import mapStyle from './mapPrototypeStyle'

// PROTOTYP: "skattkarta ritad på ett gult block". Vektordata från
// OpenFreeMap (gratis, ingen API-nyckel), egen stil i mapPrototypeStyle.js.
// Lager uppifrån och ner:
//   - kompass och post-it-lappar för platser (HTML ovanpå)
//   - ortnamn i Caveat (HTML ovanpå, placerade med hjälp av kartan)
//   - kartan, genomskinlig, med ett SVG-filter som gör strecken darriga
//   - blocket: gult papper med linjer (CSS)
const GUSTAVSBERG = [18.389, 59.326] // [longitud, latitud]

// Lägger ortnamnen som HTML-text i Caveat. Kartan räknar ut var namnen får
// plats utan att krocka (det osynliga lagret "place-anchors"); här hämtas
// de platserna och texten flyttas med när kartan rör sig.
function syncPlaceLabels(map, layer) {
  let placed = []

  function render() {
    layer.replaceChildren(
      ...placed.map(({ name, lngLat, big }) => {
        const el = document.createElement('span')
        el.className = `map-sketch-label${big ? ' map-sketch-label-big' : ''}`
        el.textContent = name
        const { x, y } = map.project(lngLat)
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
        return el
      }),
    )
  }

  function refresh() {
    const seen = new Set()
    placed = map
      .queryRenderedFeatures({ layers: ['place-anchors'] })
      .filter((f) => f.properties.name && !seen.has(f.properties.name) && seen.add(f.properties.name))
      .map((f) => ({
        name: f.properties.name,
        lngLat: f.geometry.coordinates,
        big: ['city', 'town'].includes(f.properties.class),
      }))
    render()
  }

  map.on('move', render)
  map.on('idle', refresh)
}

function MapPrototype() {
  const containerRef = useRef(null)
  const labelsRef = useRef(null)

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: GUSTAVSBERG,
      zoom: 13.5,
      attributionControl: { compact: true },
    })
    map.on('styleimagemissing', (e) => addMissingDoodle(map, e.id))
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    syncPlaceLabels(map, labelsRef.current)
    attachPlaceNotes(map, 'places')
    return () => map.remove()
  }, [])

  return (
    <div className="map-sketch">
      {/* Gör kartans streck lite darriga, som ritade för hand. */}
      <svg className="map-sketch-filters" aria-hidden="true">
        <filter id="map-sketch-wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="3.5" />
        </filter>
      </svg>
      <div ref={containerRef} className="map-sketch-canvas" />
      <div ref={labelsRef} className="map-sketch-labels" aria-hidden="true" />
      <svg className="map-sketch-compass" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="44" r="24" />
        <path d="M40 22 L46 44 L40 66 L34 44 Z" />
        <path className="map-sketch-compass-north" d="M40 22 L46 44 L34 44 Z" />
        <text x="40" y="14">N</text>
      </svg>
    </div>
  )
}

export default MapPrototype
