// PROTOTYP: snabbzoom till fasta nivåer: hela Sverige, ett landskap, ett län
// eller en kommun. Landskap, län och kommun väljs efter var skärmens mitt är.
//
// Landskapen finns redan i mapPrototypeSweden.json. Kommuner och län kommer
// från SCB:s Digitala gränser (CC0, förenklade för tematiska kartor) i
// mapPrototypeRegions.json, som bara laddas första gången den behövs. Länen
// har ingen egen yta där: vilket län en punkt ligger i följer av kommunen,
// vars kod börjar med länets kod.

import masks from './mapPrototypeMasks.json'
import { LANDSKAP_AREAS } from './mapPrototypeStyle'

export const ZOOM_LEVELS = [
  { id: 'sverige', label: 'Sverige' },
  { id: 'landskap', label: 'Landskap' },
  { id: 'lan', label: 'Län' },
  { id: 'kommun', label: 'Kommun' },
]

// Ligger punkten i ytan (Polygon eller MultiPolygon, med hål)? Strålmetoden
// över alla ringar, så att hål (t.ex. en sjö eller en annan kommun) räknas bort.
function contains(geometry, lng, lat) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let inside = false
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
  }
  return inside
}

// Utbredning [väst, syd, öst, nord] för en yta.
function bboxOf(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0]) {
      box[0] = Math.min(box[0], lng)
      box[1] = Math.min(box[1], lat)
      box[2] = Math.max(box[2], lng)
      box[3] = Math.max(box[3], lat)
    }
  }
  return box
}

// Avstånd (ungefärligt, i grader) från punkten till en utbredning. 0 = inuti.
function distanceToBbox([west, south, east, north], lng, lat) {
  const k = Math.cos((lat * Math.PI) / 180)
  const dx = Math.max(west - lng, 0, lng - east) * k
  const dy = Math.max(south - lat, 0, lat - north)
  return Math.hypot(dx, dy)
}

// Ytan som innehåller punkten, annars den närmaste (t.ex. när skärmens mitt
// är ute i havet, utanför alla kommuner).
function findAt(features, lng, lat, bbox) {
  return (
    features.find((f) => contains(f.geometry, lng, lat)) ??
    features.reduce((best, f) =>
      distanceToBbox(bbox(f), lng, lat) < distanceToBbox(bbox(best), lng, lat) ? f : best,
    )
  )
}

let regions = null
async function loadRegions() {
  if (!regions) {
    const data = (await import('./mapPrototypeRegions.json')).default
    regions = {
      kommuner: data.features.filter((f) => f.properties.kind === 'kommun'),
      lan: new Map(data.features.filter((f) => f.properties.kind === 'lan').map((f) => [f.properties.kod, f])),
    }
  }
  return regions
}

// Vilket landskap ligger punkten i? Namnet, eller null (havet, utomlands).
// Används när landskapsnamn placeras, så att ett namn som flyttas står i sitt
// eget landskap eller på tomt papper, men aldrig i ett annat landskap.
// Utbredningen kollas först, eftersom det här körs många gånger per placering.
const landskapShapes = LANDSKAP_AREAS.features.map((f) => ({
  name: f.properties.namn,
  geometry: f.geometry,
  bbox: bboxOf(f.geometry),
}))
// Urklippsytorna för landskaps- och länsvyn (mapPrototypeMasks.json): de går
// ut i havet till Sveriges gräns, så att inga öar eller kustvatten inom
// gränsen klipps bort (ytorna ovan följer kusten och saknar många öar).
// Länens hav är fördelat efter närmaste läns kust.
const maskShape = (f, key) => ({ key: f.properties[key], geometry: f.geometry, bbox: bboxOf(f.geometry) })
const landskapMasks = masks.features.filter((f) => f.properties.kind === 'landskapmask').map((f) => maskShape(f, 'namn'))
const lanMasks = masks.features.filter((f) => f.properties.kind === 'lanmask').map((f) => maskShape(f, 'kod'))

const outerRings = (shapes, key) => {
  const shape = shapes.find((s) => s.key === key)
  if (!shape) return []
  const polygons = shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates
  return polygons.map((polygon) => polygon[0])
}
const maskAt = (shapes, [lng, lat]) => {
  for (const { key, geometry, bbox } of shapes) {
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
    if (contains(geometry, lng, lat)) return key
  }
  return null
}

// Ett landskaps eller läns yttre ringar ([longitud, latitud]), för att klippa
// ut just det (se attachOutsidePaper i MapPrototype.jsx).
export const landskapRings = (name) => outerRings(landskapMasks, name)
export const lanRings = (kod) => outerRings(lanMasks, kod)

// Vilket landskap (namn) eller län (kod) punkten ligger i enligt
// urklippsytorna, eller null. Räknar havet inom gränsen till närmaste.
export const landskapMaskAt = (lngLat) => maskAt(landskapMasks, lngLat)
export const lanCodeAt = (lngLat) => maskAt(lanMasks, lngLat)

export function landskapNameAt([lng, lat]) {
  for (const { name, geometry, bbox } of landskapShapes) {
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
    if (contains(geometry, lng, lat)) return name
  }
  return null
}

// Landskapet vid punkten: { name, bounds }. Utan väntan, eftersom landskapen
// redan är laddade (används för att avgöra om nålarna ska synas).
export function landskapAt([lng, lat]) {
  const area = findAt(LANDSKAP_AREAS.features, lng, lat, (f) => bboxOf(f.geometry))
  const [w, s, e, n] = bboxOf(area.geometry)
  return { name: area.properties.namn, bounds: [[w, s], [e, n]] }
}

// Landskapet, länet eller kommunen vid punkten: { name, bounds } där bounds
// är [[väst, syd], [öst, nord]].
export async function regionAt(level, [lng, lat]) {
  if (level === 'landskap') return landskapAt([lng, lat])
  const { kommuner, lan } = await loadRegions()
  const kommun = findAt(kommuner, lng, lat, (f) => f.properties.bbox)
  const region = level === 'lan' ? lan.get(kommun.properties.lan) : kommun
  const [w, s, e, n] = region.properties.bbox
  const name = level === 'lan' ? region.properties.namn : `${region.properties.namn} kommun`
  return { name, bounds: [[w, s], [e, n]], kod: region.properties.kod }
}
