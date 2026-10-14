import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Kartan i LocationPicker, i en egen fil så att kartbiblioteket laddas först
// när någon öppnar ett formulär med en karta. En vanlig, platt karta från
// OpenFreeMap (samma kartdata som den stora kartan, men utan skissen).
// Klick på kartan flyttar nålen dit, och nålen går att dra.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
// Hela Sverige när ingen nål är satt, och hur nära nålen visas.
const SWEDEN_CENTER = [16.5, 62.5]
const SWEDEN_ZOOM = 3.6
const PIN_ZOOM = 15
const SWEDEN_BOUNDS = [
  [10.0, 54.8],
  [25.0, 69.6],
]

function LocationPickerMap({ value, onChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE,
      center: value ? [value.longitude, value.latitude] : SWEDEN_CENTER,
      zoom: value ? PIN_ZOOM : SWEDEN_ZOOM,
      maxBounds: SWEDEN_BOUNDS,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    const round = (n) => Math.round(n * 1e6) / 1e6
    map.on('click', (event) => {
      onChangeRef.current({ latitude: round(event.lngLat.lat), longitude: round(event.lngLat.lng) })
    })
    const marker = new Marker({ color: '#d0352f', draggable: true })
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat()
      onChangeRef.current({ latitude: round(lat), longitude: round(lng) })
    })
    mapRef.current = map
    markerRef.current = marker
    return () => {
      map.remove()
      mapRef.current = null
    }
    // Kartan skapas en gång; nålen följer `value` nedan.
  }, [])

  // Nålen följer värdet, och kartan flyger dit när den flyttas långt (t.ex.
  // när man väljer en träff i adressökningen).
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    if (!value) {
      marker.remove()
      return
    }
    const lngLat = [value.longitude, value.latitude]
    marker.setLngLat(lngLat).addTo(map)
    const { x, y } = map.project(lngLat)
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const offScreen = x < 0 || y < 0 || x > width || y > height
    if (offScreen || map.getZoom() < 10) map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), PIN_ZOOM) })
  }, [value])

  return <div ref={containerRef} className="location-picker-map" />
}

export default LocationPickerMap
