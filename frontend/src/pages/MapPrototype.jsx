import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addMissingDoodle } from './mapPrototypeDoodles'
import { attachPlaceNotes } from './mapPrototypeNotes'
import { attachPinsAndThread } from './mapPrototypeRoute'
import { attachPlaceSigns } from './mapPrototypeSigns'
import mapStyle from './mapPrototypeStyle'

// PROTOTYP: "skattkarta ritad på ett gult block". Vektordata från
// OpenFreeMap (gratis, ingen API-nyckel), egen stil i mapPrototypeStyle.js.
// Lager uppifrån och ner:
//   - bordskant: mörk skugga runt kanterna (CSS)
//   - kompass och tips om nålarna (HTML ovanpå)
//   - kartnålar och en tråd mellan dem som visar vägen, ovanför kartan (SVG, se mapPrototypeRoute.js)
//   - post-it-lappar för platser, limmade på kartans yta (HTML, se mapPrototypeNotes.js)
//   - ortnamn i Caveat (HTML ovanpå, placerade med hjälp av kartan)
//   - platsernas pop-up-figurer, stående i perspektiv (HTML, se mapPrototypeSigns.js)
//   - kartan, genomskinlig och lutad
//   - blocket: gult papper med linjer, lutat lika mycket som kartan (CSS)
const GUSTAVSBERG = [18.389, 59.326] // [longitud, latitud]

// Kartan lutar som ett papper på ett bord. Vinkeln är låst, så att kartan
// (som MapLibre lutar i 3D) och blockets linjer (som lutas med CSS, se
// .map-sketch-paper) alltid ligger i samma plan.
const TILT = 45

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
  const signsRef = useRef(null)
  const notesRef = useRef(null)
  const threadRef = useRef(null)
  const routeRef = useRef(null) // knapparnas funktioner (se attachPinsAndThread)
  const [route, setRoute] = useState({ placing: false, style: 'road', pinCount: 0, hint: '' })

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: GUSTAVSBERG,
      zoom: 13.5,
      pitch: TILT,
      minPitch: TILT,
      maxPitch: TILT,
      // Ingen vridning eller ändrad lutning med musen/fingrarna.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    })
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.on('styleimagemissing', (e) => addMissingDoodle(map, e.id))
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    syncPlaceLabels(map, labelsRef.current)
    attachPlaceNotes(map, 'places', notesRef.current)
    // Efter lapparna, så att hovringen redan är markerad när skyltarna ritas om.
    attachPlaceSigns(map, 'places', signsRef.current)
    routeRef.current = attachPinsAndThread(map, threadRef.current, setRoute)
    const labels = labelsRef.current
    const signs = signsRef.current
    const notes = notesRef.current
    const thread = threadRef.current
    return () => {
      map.remove()
      // Lappar, namn och nålar ligger utanför kartan, så de tas bort för sig.
      labels.replaceChildren()
      signs.replaceChildren()
      notes.replaceChildren()
      thread.replaceChildren()
    }
  }, [])

  return (
    <div className="map-sketch" style={{ '--map-tilt': `${TILT}deg` }}>
      {/* Blockets linjer, lutade på samma sätt som kartan. */}
      <div className="map-sketch-paper" aria-hidden="true" />
      <div ref={containerRef} className="map-sketch-canvas" />
      <div ref={signsRef} className="map-sketch-signs" aria-hidden="true" />
      <div ref={labelsRef} className="map-sketch-labels" aria-hidden="true" />
      <div ref={notesRef} className="map-sketch-notes" />
      <div ref={threadRef} className="map-sketch-thread" />
      <svg className="map-sketch-compass" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="44" r="24" />
        <path d="M40 22 L46 44 L40 66 L34 44 Z" />
        <path className="map-sketch-compass-north" d="M40 22 L46 44 L34 44 Z" />
        <text x="40" y="14">N</text>
      </svg>
      <div className="map-sketch-tools" role="toolbar" aria-label="Nålar och väg">
        <button
          type="button"
          className={`map-tool${route.placing ? ' is-on' : ''}`}
          aria-pressed={route.placing}
          onClick={() => routeRef.current?.setPlacing(!route.placing)}
        >
          <svg className="map-tool-pin" viewBox="0 0 10 16" aria-hidden="true">
            <path d="M5 8 L5.4 15.5" stroke="#3a2f25" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="5" cy="5" r="3.8" fill="#a32d2d" stroke="#3a2f25" strokeWidth="1.2" />
          </svg>
          {route.placing ? 'Klar' : 'Sätt ut nålar'}
        </button>
        <div className="map-tool-group" role="group" aria-label="Trådens stil">
          <button
            type="button"
            className={`map-tool${route.style === 'road' ? ' is-on' : ''}`}
            aria-pressed={route.style === 'road'}
            onClick={() => routeRef.current?.setStyle('road')}
          >
            Längs vägen
          </button>
          <button
            type="button"
            className={`map-tool${route.style === 'pins' ? ' is-on' : ''}`}
            aria-pressed={route.style === 'pins'}
            onClick={() => routeRef.current?.setStyle('pins')}
          >
            Nålar i svängar
          </button>
        </div>
        {route.pinCount > 0 && (
          <button type="button" className="map-tool" onClick={() => routeRef.current?.clear()}>
            Ta bort nålar
          </button>
        )}
      </div>
      {route.hint && <p className="map-sketch-hint">{route.hint}</p>}
      <div className="map-sketch-table" aria-hidden="true" />
    </div>
  )
}

export default MapPrototype
