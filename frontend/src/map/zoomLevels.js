// PROTOTYP: snabbzoom till fasta nivåer: hela Sverige, ett landskap, ett län
// eller en kommun. Landskap, län och kommun väljs efter var skärmens mitt är.
//
// Landskapen finns redan i map/data/sweden.json. Kommuner och län kommer
// från SCB:s Digitala gränser (CC0, förenklade för tematiska kartor) i
// map/data/regions.json, som bara laddas första gången den behövs. Länen
// har ingen egen yta där: vilket län en punkt ligger i följer av kommunen,
// vars kod börjar med länets kod.

import masks from './data/masks.json'
import { LANDSKAP_AREAS } from './style'

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

// Avstånd (ungefärligt, i grader i kvadrat) från punkten till ytans kant.
function distanceToOutline(geometry, lng, lat) {
  const k = Math.cos((lat * Math.PI) / 180)
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let nearest = Infinity
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = (ring[i][0] - lng) * k
        const ay = ring[i][1] - lat
        const dx = (ring[i + 1][0] - lng) * k - ax
        const dy = ring[i + 1][1] - lat - ay
        const t = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
        nearest = Math.min(nearest, (ax + t * dx) ** 2 + (ay + t * dy) ** 2)
      }
    }
  }
  return nearest
}

// Ytan som innehåller punkten, annars den vars kant ligger närmast. Ytorna är
// förenklade, så orter längs kusten och i skärgården hamnar ofta utanför alla
// kommuner (Sandhamn, Vaxholm, Lysekil), och skärmens mitt kan vara ute i havet.
// Kanten, inte utbredningen: Värmdös stora utbredning täcker också Vaxholm.
function findAt(features, lng, lat) {
  const inside = features.find((f) => contains(f.geometry, lng, lat))
  if (inside) return inside
  let nearest = null
  let distance = Infinity
  for (const f of features) {
    const d = distanceToOutline(f.geometry, lng, lat)
    if (d < distance) {
      nearest = f
      distance = d
    }
  }
  return nearest
}

let regions = null
async function loadRegions() {
  if (!regions) {
    const data = (await import('./data/regions.json')).default
    regions = {
      kommuner: data.features.filter((f) => f.properties.kind === 'kommun'),
      lan: new Map(data.features.filter((f) => f.properties.kind === 'lan').map((f) => [f.properties.kod, f])),
    }
  }
  return regions
}

// Kommunen med en viss kod (som i profilen), som { name, bounds, kod, geometry },
// eller null.
export async function kommunByCode(code) {
  const { kommuner } = await loadRegions()
  const kommun = kommuner.find((f) => f.properties.kod === code)
  if (!kommun) return null
  const [w, s, e, n] = kommun.properties.bbox
  return {
    name: `${kommun.properties.namn} kommun`,
    bounds: [[w, s], [e, n]],
    kod: code,
    lan: kommun.properties.lan,
    geometry: kommun.geometry,
    label: kommun.properties.label,
  }
}

// Ligger punkten i ytan (för t.ex. kommunens yta från kommunByCode)?
export const isInside = (geometry, [lng, lat]) => contains(geometry, lng, lat)

// Vilket landskap ligger punkten i? Namnet, eller null (havet, utomlands).
// Används när landskapsnamn placeras, så att ett namn som flyttas står i sitt
// eget landskap eller på tomt papper, men aldrig i ett annat landskap.
// Utbredningen kollas först, eftersom det här körs många gånger per placering.
const landskapShapes = LANDSKAP_AREAS.features.map((f) => ({
  name: f.properties.namn,
  geometry: f.geometry,
  bbox: bboxOf(f.geometry),
}))
// Urklippsytorna för landskaps- och länsvyn (map/data/masks.json): de går
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
// ut just det (se attachOutsidePaper i MapPage.jsx).
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
  const area = findAt(LANDSKAP_AREAS.features, lng, lat)
  const [w, s, e, n] = bboxOf(area.geometry)
  return { name: area.properties.namn, bounds: [[w, s], [e, n]] }
}

// Landskapet, länet eller kommunen vid punkten: { name, bounds } där bounds
// är [[väst, syd], [öst, nord]].
export async function regionAt(level, [lng, lat]) {
  if (level === 'landskap') return landskapAt([lng, lat])
  const { kommuner, lan } = await loadRegions()
  const kommun = findAt(kommuner, lng, lat)
  const region = level === 'lan' ? lan.get(kommun.properties.lan) : kommun
  const [w, s, e, n] = region.properties.bbox
  const name = level === 'lan' ? region.properties.namn : `${region.properties.namn} kommun`
  // `lan`: länets kod (för en kommun dess län, för ett län länet självt).
  return {
    name,
    bounds: [[w, s], [e, n]],
    kod: region.properties.kod,
    lan: kommun.properties.lan,
    // Kommunens yta och namnpunkt (för att hitta centralorten, se MapPage.jsx).
    ...(level === 'kommun' && { geometry: kommun.geometry, label: kommun.properties.label }),
  }
}

// Alla kommuner: Map från kommunkod till { kod, name, label } (namnpunkten).
export async function allKommuner() {
  const { kommuner } = await loadRegions()
  return new Map(
    kommuner.map((f) => [
      f.properties.kod,
      // geometry och bbox: för att hitta kommunen en position ligger i (se
      // map/activities.js).
      { kod: f.properties.kod, name: f.properties.namn, label: f.properties.label, geometry: f.geometry, bbox: bboxOf(f.geometry) },
    ]),
  )
}

// Ett län efter kod: { name, bounds, kod, lan }, eller null.
export async function lanByCode(code) {
  const { lan } = await loadRegions()
  const region = lan.get(code)
  if (!region) return null
  const [w, s, e, n] = region.properties.bbox
  return { name: region.properties.namn, bounds: [[w, s], [e, n]], kod: code, lan: code }
}

// Kommunerna i ett län, som GeoJSON (för gränserna i länsvyn) och som
// namnpunkter ({ id, name, lngLat }).
export async function kommunerInLan(code) {
  const { kommuner } = await loadRegions()
  const features = kommuner.filter((f) => f.properties.lan === code)
  return {
    geojson: { type: 'FeatureCollection', features },
    labels: features.map((f) => ({ id: f.properties.kod, name: f.properties.namn, lngLat: f.properties.label })),
  }
}
