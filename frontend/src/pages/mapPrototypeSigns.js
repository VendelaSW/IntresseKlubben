import { FIGURE_HEIGHT_PX, FIGURE_WIDTH_PX, figureUrl } from './mapPrototypeDoodles'
import { placeGroup } from './mapPrototypeStyle'

// PROTOTYP: platsernas pop-up-figurer (pappkort på en fot), stående i samma
// perspektiv som 3D-husen.
//
// Kartan bestämmer fortfarande vilka platser som syns: ikonerna i lagret
// "places" är osynliga men placeras och krockar som vanligt, och hovring och
// klick går till dem. Här hämtas de placerade platserna och ritas som bilder
// ovanpå kartan:
//   - kortet står upp från pappret, sett snett ovanifrån som husens väggar
//     (lutat med CSS i samma perspektiv som kartans kamera),
//   - kort längre bort blir mindre och närmare större, som husen,
//   - de växer lite när man zoomar in (inte lika fort som husen, så att de
//     inte blir enorma),
//   - en platt skugga ligger på pappret under varje kort.

const POI = { source: 'openmaptiles', sourceLayer: 'poi' }

// Hur stora korten får bli jämfört med vanlig storlek.
const MIN_SCALE = 0.5
const MAX_SCALE = 2

// Skärmpixlar per meter österut vid en plats [lng, lat].
function pixelsPerMeter(map, lngLat) {
  const east = [lngLat[0] + 1 / (111320 * Math.cos((lngLat[1] * Math.PI) / 180)), lngLat[1]]
  const a = map.project(lngLat)
  const b = map.project(east)
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// Kopplar skyltarna till symbollagret `layerId`. `layer` är elementet de
// ritas i (med perspektiv i CSS, se .map-sketch-signs).
export function attachPlaceSigns(map, layerId, layer) {
  const signs = new Map() // id -> { lngLat, group, card, shadow }

  // Hämtar vilka platser kartan har placerat, och lägger till eller tar bort
  // skyltar så att de stämmer.
  function refresh() {
    const placed = new Map()
    for (const feature of map.queryRenderedFeatures({ layers: [layerId] })) {
      const group = placeGroup(feature.properties)
      if (group && !placed.has(feature.id)) placed.set(feature.id, { lngLat: feature.geometry.coordinates, group })
    }
    for (const [id, sign] of signs) {
      if (!placed.has(id)) {
        sign.card.remove()
        sign.shadow.remove()
        signs.delete(id)
      }
    }
    for (const [id, { lngLat, group }] of placed) {
      if (signs.has(id)) continue
      const shadow = document.createElement('div')
      shadow.className = 'map-sign-shadow'
      const card = document.createElement('img')
      card.className = 'map-sign'
      card.alt = ''
      layer.append(shadow, card)
      signs.set(id, { lngLat, group, card, shadow })
    }
    render()
  }

  function render() {
    const zoom = map.getZoom()
    // Tona in mellan zoom 14 och 14,5, som innan.
    layer.style.opacity = Math.min(1, Math.max(0, (zoom - 14) * 2))
    // Kortet står vinkelrätt mot pappret: pappret lutar `pitch` grader bakåt,
    // så kortet lutar (pitch - 90) grader, dvs. framåt mot betraktaren.
    const tilt = map.getPitch() - 90
    const atCenter = pixelsPerMeter(map, map.getCenter().toArray())
    const zoomScale = 2 ** ((zoom - 15.5) * 0.5)

    for (const [id, sign] of signs) {
      const p = map.project(sign.lngLat)
      const depth = pixelsPerMeter(map, sign.lngLat) / atCenter
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, depth * zoomScale))
      const lifted = Boolean(map.getFeatureState({ ...POI, id }).hover)
      const src = figureUrl(sign.group, lifted)
      if (sign.card.getAttribute('src') !== src) sign.card.src = src

      const w = FIGURE_WIDTH_PX * scale
      const h = FIGURE_HEIGHT_PX * scale
      sign.card.style.width = `${w}px`
      sign.card.style.height = `${h}px`
      // Nedre kanten (foten) på platsen, sedan rest upp från pappret.
      sign.card.style.transform = `translate(${p.x - w / 2}px, ${p.y - h}px) rotateX(${tilt}deg)`
      // Närmare skyltar (längre ned på skärmen) framför skyltar längre bort.
      sign.card.style.zIndex = Math.round(p.y)

      // Skuggan: platt ellips på pappret, mindre när kortet är lyft.
      const sw = (lifted ? 16 : 22) * scale
      const sh = (lifted ? 5 : 7) * scale
      sign.shadow.style.width = `${sw}px`
      sign.shadow.style.height = `${sh}px`
      sign.shadow.style.opacity = lifted ? 0.6 : 1
      sign.shadow.style.transform = `translate(${p.x - sw / 2 + 2 * scale}px, ${p.y - sh / 2}px)`
    }
  }

  map.on('move', render)
  map.on('idle', refresh)
  // Hovring ändrar inte kartan, så rita om när man pekar på eller lämnar en
  // plats (attachPlaceNotes har då redan satt feature-state).
  map.on('mouseenter', layerId, render)
  map.on('mouseleave', layerId, render)
}
