import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Kartan i LocationPicker, i en egen fil så att kartbiblioteket laddas först
// när någon öppnar ett formulär med en karta. En vanlig, platt karta från
// OpenFreeMap (samma kartdata som den stora kartan, men utan skissen).
// Klick på kartan flyttar nålen dit, och nålen går att dra.
//
// Utan nål visas `kommunCode`:s kommun (t.ex. klubbens eller ens egen), annars
// hela Sverige. Kommunens yta kommer från den stora kartans data, som laddas
// först när den behövs.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
// Hur nära nålen visas, och Sverige (för att visa hela landet utan nål).
const PIN_ZOOM = 15
const SWEDEN_BOUNDS = [
  [10.5, 55.0],
  [24.5, 69.3],
]

function LocationPickerMap({ value, onChange, kommunCode }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE,
      ...(value
        ? { center: [value.longitude, value.latitude], zoom: PIN_ZOOM }
        : { bounds: SWEDEN_BOUNDS, fitBoundsOptions: { padding: 10 } }),
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

  // Utan nål: visa kommunen när den är känd (och när den byts i formuläret).
  const hasPin = Boolean(value)
  useEffect(() => {
    if (!kommunCode || hasPin) return undefined
    let cancelled = false
    import('../pages/mapPrototypeZoomLevels')
      .then(({ kommunByCode }) => kommunByCode(kommunCode))
      .then((kommun) => {
        if (!cancelled && kommun && mapRef.current) mapRef.current.fitBounds(kommun.bounds, { padding: 20 })
      })
      .catch(() => {
        // Då visas hela Sverige, som utan kommun.
      })
    return () => {
      cancelled = true
    }
  }, [kommunCode, hasPin])

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
