// PROTOTYP: 3D-hus som ser skissade ut, ritade för hand med bläck och
// blyerts ovanpå kartan.
//
// MapLibres egna 3D-hus (fill-extrusion) kan bara fyllas med färg eller
// mönster, inte få bläcklinjer längs kanterna. Därför ritas husen här på en
// egen canvas ovanpå kartan, i kartans perspektiv:
//   - kartan ger husens form och höjd via ett osynligt lager ("building-shapes"),
//   - varje hus ritas med väggarna som vetter mot betraktaren och taket överst,
//   - hus längre bort ritas först och närmare ovanpå (målarens algoritm),
//   - allt ser blyertsritat ut på blocket, som vattnet och Emmys
//     platta hus: tydliga grafitkanter som darrar en aning, och sned
//     skraffering på tak (glest) och väggar (glest mot ljuset, tätare bort
//     från det),
//   - på pappret ligger en svag, platt skugga från varje hus.
//
// Skrafferingen ritas som riktiga streck fästa vid varje yta (taket i kartans
// koordinater, väggarna längs väggen), inte som ett canvas-mönster: ett
// mönster ligger fast mot skärmen, så strecken "simmade" över husen när
// kartan rörde sig. Avståndet mellan strecken är fast inom en zoomnivå och
// halveras/dubblas vid hela nivåer, som vattnets mönster.
//
// Husen växer upp mellan zoom 14 och 15, som innan, så att de inte poppar.

import { mapDefaultTheme } from './themes'
import { boxInSweden, inSweden, pixelRatio, refreshWhileMoving, pixelsPerMeter } from './style'

const LAYER_ID = 'building-shapes'
// Blyerts på blocket: varm brun grafit på husen i varma akvarellfärger. Ytorna är
// täckande, så att hus längre bort inte syns igenom, med taken ljusast och
// väggarna mörkare.
let INK
// Som putsade hus: ljusa tak med en aning färg, och väggar i en mjuk ton, så att husen inte ser ut som containrar.
let PALETTES
// Hur ofta varje färg kommer: mest grädde och honung, så att det ser ut som en stad och inte som konfetti.
const PALETTE_ODDS = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5]
let SHADOW_FILL
// Skrafferingen: ungefärligt avstånd i pixlar mellan strecken (som vattnet),
// och hur mörka strecken är på tak, ljusa väggar och mörka väggar.
const HATCH_PX = 4.5
let HATCH

// Ritar om husen när temat byts (se attachSketchedBuildings).
let redraw = null

let LINE_WIDTH = 1.2
let HEIGHT_SCALE = 1
let WALL_PATTERN = null
let ROOF_PATTERN = null
let OUTLINE = 'normal'
let GRAPHITE = '84, 58, 36'

// TILLFÄLLIGT (testläget): husens färger och stil, se map/themes.js.
export function setBuildingTheme(theme) {
  PALETTES = theme.palettes
  INK = theme.ink
  GRAPHITE = theme.graphite
  SHADOW_FILL = `rgba(${theme.graphite}, ${theme.shadow})`
  WALL_PATTERN = theme.wallPattern
  ROOF_PATTERN = theme.roofPattern
  OUTLINE = theme.outline
  const stroke = ([every, alpha]) => ({ every, color: `rgba(${theme.graphite}, ${alpha})` })
  HATCH = theme.hatch && { roof: stroke(theme.hatch.roof), lit: stroke(theme.hatch.lit), dark: stroke(theme.hatch.dark) }
  LINE_WIDTH = theme.lineWidth
  HEIGHT_SCALE = theme.heightScale
  redraw?.()
}
setBuildingTheme(mapDefaultTheme())

// Platta "kartmeter" kring Gustavsberg, så att takens streck ligger fast på
// kartan och fortsätter jämnt från hus till hus.
const COS_LAT = Math.cos((59.32 * Math.PI) / 180)
const toMeters = (lng, lat) => [lng * 111320 * COS_LAT, lat * 111320]
const fromMeters = (x, y) => [x / (111320 * COS_LAT), y / 111320]
// Skuggans riktning på skärmen per pixel höjd: åt höger och lite nedåt, som
// nålarnas och lapparnas skuggor.
const SHADOW = { x: 0.55, y: 0.18 }

// --- Geometri ---

// Liten fast "slump" per punkt, så att bläcklinjerna darrar men inte fladdrar
// när kartan rör sig.
function jitter(lng, lat, salt) {
  const n = Math.sin(lng * 12.9898e3 + lat * 78.233e3 + salt * 37.719) * 43758.5453
  return (n - Math.floor(n) - 0.5) * 0.8
}

// Husets färg: fast per hus, så att den inte byts när kartan rör sig. Ett hus som delas av en kartruta har samma id i
// båda delarna, och får därför samma färg.
function paletteFor(feature, lng, lat) {
  const seed = feature.id ?? Math.round(lng * 1e4) * 31 + Math.round(lat * 1e4)
  const n = Math.sin(Number(seed) * 12.9898) * 43758.5453
  return PALETTE_ODDS[Math.floor((n - Math.floor(n)) * PALETTE_ODDS.length)]
}

// Är kanten en klippkant från kartrutorna (husen delas där rutorna möts), och
// inte en riktig vägg? Sådana kanter går exakt längs en rutgräns på zoom 14,
// eller längs rutans buffertzon strax utanför.
function isTileSeam(a, b) {
  const tiles = 2 ** 14
  const tx = (lng) => ((lng + 180) / 360) * tiles
  const ty = (lat) => {
    const r = (lat * Math.PI) / 180
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * tiles
  }
  const nearGrid = (t) => {
    const f = t - Math.floor(t)
    return Math.min(f, 1 - f) < 0.02
  }
  const ax = tx(a[0])
  const bx = tx(b[0])
  const ay = ty(a[1])
  const by = ty(b[1])
  return (Math.abs(ax - bx) < 1e-7 && nearGrid(ax)) || (Math.abs(ay - by) < 1e-7 && nearGrid(ay))
}

function rings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

// Projektiv avbildning från enhetskvadraten (s, t i 0..1) till fyrhörningen
// p0 (0,0), p1 (1,0), p2 (1,1), p3 (0,1) på skärmen. Returnerar en funktion.
function squareToQuad(p0, p1, p2, p3) {
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const h = (dx1 * dy3 - dx3 * dy1) / den
  const a = p1.x - p0.x + g * p1.x
  const b = p3.x - p0.x + h * p3.x
  const d = p1.y - p0.y + g * p1.y
  const e = p3.y - p0.y + h * p3.y
  return (s, t) => {
    const w = g * s + h * t + 1
    return [(a * s + b * t + p0.x) / w, (d * s + e * t + p0.y) / w]
  }
}


// Hur stort (i pixlar) en yta måste vara på skärmen för att få skraffering.
// Mindre hus syns ändå bara som prickar, och strecken kostar mest tid.
const MIN_HATCH_PX = 3
// Detaljnivå efter hur höga väggarna är på skärmen. Lägre än FLAT_PX: huset
// ritas platt (tak med kontur), alla sådana i ett enda anrop. Under
// DETAIL_PX: väggar och tak utan skraffering. Annars allt. Antalet
// ritanrop, inte räknandet, är det som kostar när tusentals hus syns.
// Strecken är ungefär hälften av ritanropen, så bara större hus (nära eller
// höga) skrafferas: i tät stad 20-25 % fler bilder/s än när alla hus
// skrafferades. Samma gräns gäller när kartan rör sig, så att inget blinkar.
const FLAT_PX = 3
const DETAIL_PX = 14

// Förbereder ett hus för ritning: allt som inte beror på kameran (meter,
// klippkanter mellan kartrutor, väggarnas längd, darret i linjerna och takets
// mått) räknas ut en gång när kartan har stannat, i stället för i varje
// bildruta medan man drar.
function prepare(feature) {
  const height = feature.properties.render_height ?? 5
  const base = feature.properties.render_min_height ?? 0
  const polygons = rings(feature.geometry).map((polygon) => {
    const ringData = polygon.map((ring) => {
      const pts = ring.map(([lng, lat], k) => {
        const [mx, my] = toMeters(lng, lat)
        return { lng, lat, mx, my, wx: mercatorX(lng), wy: mercatorY(lat), jx: jitter(lng, lat, k), jy: jitter(lat, lng, k) }
      })
      const seam = []
      const len = []
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k]
        const b = pts[k + 1]
        seam.push(isTileSeam([a.lng, a.lat], [b.lng, b.lat]))
        len.push(Math.hypot(b.mx - a.mx, b.my - a.my))
      }
      return { pts, seam, len }
    })
    // Takets mått i kartmeter, för skrafferingen (linjer där x + y är fast).
    const roof = { uMin: Infinity, uMax: -Infinity, vMin: Infinity, vMax: -Infinity }
    Object.assign(roof, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity })
    for (const { mx, my } of ringData[0]?.pts ?? []) {
      roof.uMin = Math.min(roof.uMin, mx + my)
      roof.uMax = Math.max(roof.uMax, mx + my)
      roof.vMin = Math.min(roof.vMin, mx - my)
      roof.vMax = Math.max(roof.vMax, mx - my)
      roof.x0 = Math.min(roof.x0, mx)
      roof.x1 = Math.max(roof.x1, mx)
      roof.y0 = Math.min(roof.y0, my)
      roof.y1 = Math.max(roof.y1, my)
    }
    const first = ringData[0]?.pts[0]
    return { rings: ringData, roof, palette: paletteFor(feature, first?.lng ?? 0, first?.lat ?? 0) }
  })
  return { polygons, height, base }
}

// Husen ritas ovanpå kartan, så kartans mask utanför Sverige täcker dem
// inte. De som ligger utanför hoppas över i stället (se inSweden).

// Platt Mercator (0..1), samma som MapLibre räknar i.
const mercatorX = (lng) => (lng + 180) / 360
const mercatorY = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360

// Snabb projektion till skärmen för en bildruta. map.project() skapar nya
// objekt och räknar om samma sak för varje hörn, och kostade mest tid när
// tusentals små hus syns (runt zoom 14-15). Här används kamerans matris
// direkt. Den är intern i MapLibre, så finns den inte faller vi tillbaka på
// map.project(). Ger { x, y } eller null om punkten är bakom kameran.
function makeProjector(map) {
  const transform = map.transform
  const m = transform?.pixelMatrix ?? transform?._pixelMatrix
  const size = transform?.worldSize
  if (!m || !size) return (pt) => map.project([pt.lng, pt.lat])
  return (pt) => {
    const x = pt.wx * size
    const y = pt.wy * size
    const w = m[3] * x + m[7] * y + m[15]
    if (w <= 0) return null
    return { x: (m[0] * x + m[4] * y + m[12]) / w, y: (m[1] * x + m[5] * y + m[13]) / w }
  }
}

// Ett hus (en grupp hus med samma höjd i en kartruta) känns igen på rutan och
// sitt id. Samma hus kommer tillbaka varje gång kartan stannar i samma
// område. Rutan är intern i MapLibre, så finns den inte används första
// hörnet, antalet hörn och höjden (då måste formen läsas, vilket kostar mer).
function cacheKey(feature) {
  if (feature._z !== undefined && feature.id !== undefined) {
    return `${feature._z}/${feature._x}/${feature._y}/${feature.id}`
  }
  const { coordinates, type } = feature.geometry
  const flat = coordinates.flat(type === 'MultiPolygon' ? 2 : 1)
  const first = flat[0] ?? []
  const { render_height: height, render_min_height: base } = feature.properties
  return `${first[0]},${first[1]},${flat.length},${height},${base}`
}

// Bara hus i Sverige ritas. Hela gruppens rektangel testas först, och bara
// grupper som ligger över gränsen testas hus för hus.
function keepInSweden(polygons) {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const { rings } of polygons) {
    for (const { lng, lat } of rings[0]?.pts ?? []) {
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  if (west > east) return []
  const where = boxInSweden(west, south, east, north)
  if (where !== 'border') return where === 'inside' ? polygons : []
  return polygons.filter(({ rings }) => {
    const first = rings[0]?.pts[0]
    return first && inSweden(first.lng, first.lat)
  })
}

// Så många förberedda grupper sparas (en vy på zoom 15 har ett par hundra).
// Fler än så: cachen töms och fylls på nytt med det som syns.
const CACHE_SIZE = 3000

// Kopplar de skissade husen till kartan. `canvas` är ritytan ovanpå kartan.
export function attachSketchedBuildings(map, canvas) {
  const ctx = canvas.getContext('2d')
  let buildings = [] // från prepare()
  // prepare() är det som kostar mest när kartan stannar, och det mesta av
  // det som syns har oftast förberetts förut.
  const prepared = new Map()

  function prepareCached(feature) {
    const key = cacheKey(feature)
    let building = prepared.get(key)
    if (!building) {
      building = prepare(feature)
      building.polygons = keepInSweden(building.polygons)
      if (prepared.size >= CACHE_SIZE) prepared.clear()
      prepared.set(key, building)
    }
    return building
  }

  // Hämtar husen som kartan har i bild. Samma hus som förra gången (samma
  // objekt ur cachen) ritas inte om: kartan har redan ritat dem vid move.
  // Medan kartan rör sig ritas de av move strax efter.
  function refresh() {
    if (!map.getLayer(LAYER_ID)) return
    const next = map.queryRenderedFeatures({ layers: [LAYER_ID] }).map(prepareCached)
    if (next.length === buildings.length && next.every((building, i) => building === buildings[i])) return
    buildings = next
    if (!map.isMoving()) render()
  }

  function resize() {
    const ratio = pixelRatio()
    const { clientWidth: w, clientHeight: h } = canvas
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  // Sökvägen byggs som en SVG-sträng och ritas med ett Path2D-anrop. Tusentals
  // moveTo/lineTo-anrop direkt på canvasen var det som kostade mest (vart och
  // ett går från JavaScript till webbläsaren); en sträng tolkas i ett svep och
  // var ungefär 20 gånger snabbare. En decimal räcker på skärmen.
  let path = ''
  const r = (v) => Math.round(v * 10) / 10
  const begin = () => {
    path = ''
  }
  const M = (x, y) => {
    path += 'M' + r(x) + ' ' + r(y)
  }
  const L = (x, y) => {
    path += 'L' + r(x) + ' ' + r(y)
  }
  const Z = () => {
    path += 'Z'
  }
  const fillPath = (rule = 'nonzero') => path && ctx.fill(new Path2D(path), rule)
  const strokePath = () => path && ctx.stroke(new Path2D(path))
  // Husens kontur i vald stil: vanlig, ingen, streckad eller dubbel (samma linje två gånger, lite förskjuten).
  const outlinePath = () => {
    if (!path || OUTLINE === 'none') return
    const line = new Path2D(path)
    if (OUTLINE === 'dashed') ctx.setLineDash([5, 3])
    ctx.stroke(line)
    if (OUTLINE === 'dashed') ctx.setLineDash([])
    if (OUTLINE === 'double') {
      ctx.save()
      ctx.translate(1.3, -0.9)
      ctx.stroke(line)
      ctx.restore()
    }
  }
  const clipPath = (rule) => ctx.clip(new Path2D(path), rule)

  function render() {
    resize()
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    const zoom = map.getZoom()
    // Husen växer upp mellan zoom 14 och 15.
    const grown = Math.min(1, Math.max(0, zoom - 14))
    if (grown <= 0 || buildings.length === 0) return

    const sinPitch = Math.sin((map.getPitch() * Math.PI) / 180)
    const center = map.getCenter().toArray()
    const centerScale = pixelsPerMeter(map, center)
    // Skärmpixlar uppåt per meter höjd, vid skärmens mitt. Varje hus skalas
    // sedan med hur långt bort det står (som pins och skyltar).
    const upAtCenter = centerScale * sinPitch * grown

    // Bara hus inom det synliga området (med lite marginal). Kartdatan slår
    // ihop hus med samma höjd till stora grupper per kartruta, och hus långt
    // utanför bild, särskilt bakom "kameran", ger orimliga skärmkoordinater.
    const bounds = map.getBounds()
    const west = bounds.getWest()
    const east = bounds.getEast()
    const south = bounds.getSouth()
    const north = bounds.getNorth()
    const marginLng = (east - west) * 0.15
    const marginLat = (north - south) * 0.15
    const inView = ({ lng, lat }) =>
      lng >= west - marginLng && lng <= east + marginLng && lat >= south - marginLat && lat <= north + marginLat
    const limit = 3 * Math.max(canvas.clientWidth, canvas.clientHeight)
    const project = makeProjector(map)
    // Ett hörn och en punkt en meter österut, för hur stort huset är på
    // skärmen jämfört med skärmens mitt (som pixelsPerMeter).
    const metersEast = 1 / (111320 * COS_LAT)
    const width = canvas.clientWidth
    const heightPx = canvas.clientHeight

    // Projicera alla hus: fot (marken) och tak för varje hörn.
    const projected = []
    for (const building of buildings) {
      for (const polygon of building.polygons) {
        const outerPts = polygon.rings[0]?.pts
        if (!outerPts?.length || !outerPts.every(inView)) continue
        const first = outerPts[0]
        const p0 = project(first)
        const p1 = project({ lng: first.lng + metersEast, lat: first.lat, wx: mercatorX(first.lng + metersEast), wy: first.wy })
        if (!p0 || !p1) continue
        const depth = Math.hypot(p1.x - p0.x, p1.y - p0.y) / centerScale
        const lift = upAtCenter * depth
        const top = building.height * HEIGHT_SCALE * lift
        const bottom = building.base * HEIGHT_SCALE * lift
        let tooFar = false
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        const screenRings = polygon.rings.map((ring, ringIndex) =>
          ring.pts.map((pt) => {
            const p = project(pt)
            if (!p) {
              tooFar = true
              return null
            }
            const q = { pt, x: p.x, y: p.y - bottom, ty: p.y - top }
            if (ringIndex === 0) {
              if (Math.abs(q.x) > limit || Math.abs(q.ty) > limit) tooFar = true
              if (q.x < minX) minX = q.x
              if (q.x > maxX) maxX = q.x
              if (q.ty < minY) minY = q.ty
              if (q.y > maxY) maxY = q.y
            }
            return q
          }),
        )
        // Säkerhetsnät: hoppa över hus som ändå hamnar orimligt långt bort.
        if (tooFar) continue
        // Utanför skärmen (taket, foten och skuggan åt höger räknade): rita
        // inte. Rektangeln kring det lutade synfältet är mycket större än
        // skärmen, så det här sparar ungefär 40 % av husen.
        const shadowX = SHADOW.x * (top - bottom)
        const shadowY = SHADOW.y * (top - bottom)
        if (maxX + shadowX < 0 || minX > width || maxY + shadowY < 0 || minY > heightPx) continue
        projected.push({
          polygon,
          screenRings,
          height: top - bottom,
          meters: (building.height - building.base) * HEIGHT_SCALE * grown,
          top,
          maxY,
          // Hus längre bort är mindre på skärmen. Med samma avstånd i meter
          // skulle strecken bli allt tätare där (och ta mest tid att rita), så
          // avståndet dubblas i hela steg med avståndet till kameran. Strecken
          // ligger fortfarande fast på huset, som vid zoomnivåerna.
          sparser: 2 ** Math.max(0, Math.round(Math.log2(1 / depth))),
          detail: top - bottom < FLAT_PX ? 'flat' : top - bottom < DETAIL_PX ? 'simple' : 'full',
        })
      }
    }
    // Längst bort först.
    projected.sort((a, b) => a.maxY - b.maxY)

    // Skrafferingens avstånd i meter: HATCH_PX vid skärmens mitt, men låst
    // till hela zoomnivåer så att strecken inte glider när man zoomar lite.
    const levelScale = centerScale / 2 ** (zoom - Math.floor(zoom))
    const spacing = HATCH_PX / levelScale

    // 1. Skuggorna på pappret: taket förskjutet åt sidan, ihopkopplat med
    // foten, i en svag platt ton.
    // Bara kanterna som vetter åt skuggans håll behövs: resten av skuggan
    // ligger under själva huset. Parallellogrammen ritas alla åt samma håll,
    // så att de inte tar ut varandra i fyllningen.
    ctx.fillStyle = SHADOW_FILL
    begin()
    for (const { screenRings, height, detail } of projected) {
      if (detail === 'flat') continue
      const dx = SHADOW.x * height
      const dy = SHADOW.y * height
      const outer = screenRings[0]
      // Ringens varv (medurs eller moturs på skärmen) avgör vilken sida av
      // en kant som är utsidan.
      let area = 0
      for (let i = 0; i < outer.length - 1; i++) area += outer[i].x * outer[i + 1].y - outer[i + 1].x * outer[i].y
      for (let i = 0; i < outer.length - 1; i++) {
        const a = outer[i]
        const b = outer[i + 1]
        const cross = (b.x - a.x) * dy - (b.y - a.y) * dx
        // Kanten vetter åt skuggan om dess utåtnormal pekar åt samma håll.
        if (cross === 0 || Math.sign(area) * -cross <= 0) continue
        // Ett parallellogram per kant, från foten till skuggans tak.
        const [p, q] = cross > 0 ? [a, b] : [b, a]
        M(p.x, p.y)
        L(q.x, q.y)
        L(q.x + dx, q.y + dy)
        L(p.x + dx, p.y + dy)
        Z()
      }
    }
    fillPath('nonzero')

    // 2. Platta hus (långt bort eller utzoomat): alla tak i ett anrop.
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // Ett anrop per färg, och kanterna ovanpå alla.
    for (const [index, colors] of PALETTES.entries()) {
      begin()
      for (const { polygon, screenRings, detail } of projected) {
        if (detail === 'flat' && polygon.palette === index) roofPath(screenRings)
      }
      // nonzero: samma hus kan komma två gånger (från två kartrutor), och med
      // evenodd skulle de ta ut varandra. Innergårdar syns inte så här små.
      ctx.fillStyle = colors.roof
      fillPath('nonzero')
    }
    begin()
    for (const { screenRings, detail } of projected) {
      if (detail === 'flat') roofPath(screenRings)
    }
    ctx.strokeStyle = INK
    ctx.lineWidth = LINE_WIDTH
    outlinePath()

    // 3. Övriga hus, ett i taget bakifrån och fram.
    for (const building of projected) {
      const { polygon, screenRings, detail } = building
      if (detail === 'flat') continue
      // Väggarna som vetter mot betraktaren.
      const walls = []
      screenRings.forEach((ring, ringIndex) => {
        const { seam, len } = polygon.rings[ringIndex]
        let area = 0
        for (let i = 0; i < ring.length - 1; i++) area += ring[i].x * ring[i + 1].y - ring[i + 1].x * ring[i].y
        const toInside = Math.sign(area) || 1
        const isHole = ringIndex > 0
        for (let i = 0; i < ring.length - 1; i++) {
          if (seam[i]) continue
          const a = ring[i]
          const b = ring[i + 1]
          // Normalen ut från huset: bort från ringens insida, eller in i
          // ett hål (en innergård).
          const nx = -(b.y - a.y) * toInside * (isHole ? 1 : -1)
          const ny = (b.x - a.x) * toInside * (isHole ? 1 : -1)
          if (ny <= 0) continue // väggen vetter bort från betraktaren
          walls.push({ a, b, length: len[i], lit: nx < 0, depth: (a.y + b.y) / 2 })
        }
      })

      if (detail === 'simple') {
        // Låga väggar: ingen skraffering, och väggarna ritas per färg i
        // stället för en och en (ordningen mellan dem syns inte så här små).
        for (const lit of [false, true]) {
          begin()
          for (const w of walls) if (w.lit === lit) wallPath(w.a, w.b)
          ctx.fillStyle = lit ? PALETTES[polygon.palette].lit : PALETTES[polygon.palette].dark
          fillPath()
        }
        begin()
        for (const w of walls) wallOutline(w.a, w.b)
        ctx.strokeStyle = INK
        ctx.lineWidth = LINE_WIDTH
        outlinePath()
      } else {
        walls.sort((w1, w2) => w1.depth - w2.depth)
        for (const { a, b, length, lit } of walls) {
          begin()
          wallPath(a, b)
          ctx.fillStyle = lit ? PALETTES[polygon.palette].lit : PALETTES[polygon.palette].dark
          fillPath()
          if (HATCH) {
            const style = lit ? HATCH.lit : HATCH.dark
            hatchWall(a, b, length, building.meters, spacing * building.sparser * style.every, style.color)
          }
          drawWallPattern(a, b, length, building.meters, spacing * building.sparser)
          begin()
          wallOutline(a, b)
          ctx.strokeStyle = INK
          ctx.lineWidth = LINE_WIDTH
          outlinePath()
        }
      }

      // Taket överst.
      begin()
      roofPath(screenRings)
      ctx.fillStyle = PALETTES[polygon.palette].roof
      fillPath('evenodd')
      if (detail === 'full') {
        if (HATCH && !ROOF_PATTERN) hatchRoof(polygon.roof, screenRings, building.top, spacing * building.sparser * HATCH.roof.every)
        if (ROOF_PATTERN) drawRoofPattern(polygon.roof, screenRings, building.top, building.sparser, spacing)
      }
      roofStroke(polygon, screenRings)
    }
  }

  // Takets yta (alla ringar) i den aktuella sökvägen.
  function roofPath(screenRings) {
    for (const ring of screenRings) {
      ring.forEach((p, i) => (i === 0 ? M(p.x, p.ty) : L(p.x, p.ty)))
      Z()
    }
  }

  // Väggens yta mellan fotens hörn a och b, i den aktuella sökvägen.
  function wallPath(a, b) {
    M(a.x, a.y)
    L(b.x, b.y)
    L(b.x, b.ty)
    L(a.x, a.ty)
    Z()
  }

  // Mönstret på en vägg: fönster, tegel, panel eller korsskraffering. Bara när väggen är stor nog på skärmen, så att
  // mönstret syns och det inte blir tusentals streck att rita långt bort.
  function drawWallPattern(a, b, length, meters, spacing) {
    if (!WALL_PATTERN) return
    if (WALL_PATTERN === 'crosshatch') {
      hatchWall(b, a, length, meters, spacing * 1.4, `rgba(${GRAPHITE}, 0.28)`)
      return
    }
    const heightPx = Math.max(a.y - a.ty, b.y - b.ty)
    const widthPx = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 3 || meters < 2 || heightPx < 9 || widthPx < 9) return
    const atX = (s) => a.x + (b.x - a.x) * s
    const atY = (s, h) => {
      const base = a.y + (b.y - a.y) * s
      const roof = a.ty + (b.ty - a.ty) * s
      return base + (roof - base) * h
    }
    begin()
    if (WALL_PATTERN === 'windows' || WALL_PATTERN === 'litWindows') {
      const floors = Math.max(1, Math.min(12, Math.round(meters / 3)))
      const columns = Math.max(1, Math.min(24, Math.round(length / 4)))
      if (heightPx / floors < 4 || widthPx / columns < 4) return
      for (let floor = 0; floor < floors; floor++) {
        const hLow = (floor + 0.3) / floors
        const hHigh = (floor + 0.72) / floors
        for (let column = 0; column < columns; column++) {
          const sLeft = (column + 0.3) / columns
          const sRight = (column + 0.7) / columns
          // Ungefär vart tredje upplyst fönster är släckt, fast per fönster.
          if (WALL_PATTERN === 'litWindows' && (floor * 7 + column * 13 + Math.round(length)) % 3 === 0) continue
          M(atX(sLeft), atY(sLeft, hLow))
          L(atX(sRight), atY(sRight, hLow))
          L(atX(sRight), atY(sRight, hHigh))
          L(atX(sLeft), atY(sLeft, hHigh))
          Z()
        }
      }
      ctx.fillStyle = WALL_PATTERN === 'litWindows' ? '#f7cf52' : `rgba(${GRAPHITE}, 0.5)`
      fillPath()
      return
    }
    if (WALL_PATTERN === 'panels') {
      const lines = Math.min(60, Math.floor(widthPx / 4), Math.round(length / 1.2))
      for (let i = 1; i < lines; i++) {
        M(atX(i / lines), atY(i / lines, 0))
        L(atX(i / lines), atY(i / lines, 1))
      }
    } else {
      // Liggande panel och tegel: en linje per rad. Teglet får också korta stötfogar, förskjutna varannan rad.
      const rows = Math.min(40, Math.floor(heightPx / 3.5), Math.round(meters / (WALL_PATTERN === 'brick' ? 0.75 : 0.6)))
      const joints = Math.min(30, Math.floor(widthPx / 8))
      for (let row = 1; row <= rows; row++) {
        const h = row / rows
        if (row < rows) {
          M(atX(0), atY(0, h))
          L(atX(1), atY(1, h))
        }
        if (WALL_PATTERN !== 'brick' || joints < 2) continue
        for (let j = 0; j < joints; j++) {
          const s = (j + (row % 2 ? 0.25 : 0.75)) / joints
          M(atX(s), atY(s, (row - 1) / rows))
          L(atX(s), atY(s, h))
        }
      }
    }
    ctx.strokeStyle = `rgba(${GRAPHITE}, 0.34)`
    ctx.lineWidth = 0.7
    strokePath()
  }

  // Mönstret på ett tak: ritas inom taket (clip), i takets egna mått, så att det ligger fast när kartan rör sig.
  function drawRoofPattern(roof, screenRings, top, sparser, spacing) {
    const { x0, x1, y0, y1 } = roof
    const dx = x1 - x0
    const dy = y1 - y0
    if (dx < 0.1 || dy < 0.1) return
    const corner = (x, y) => {
      const p = map.project(fromMeters(x, y))
      return { x: p.x, y: p.y - top }
    }
    const c00 = corner(x0, y0)
    const c11 = corner(x1, y1)
    if (Math.abs(c11.x - c00.x) < MIN_HATCH_PX * 2 && Math.abs(c11.y - c00.y) < MIN_HATCH_PX * 2) return
    const toScreen = squareToQuad(c00, corner(x1, y0), c11, corner(x0, y1))
    // Punkt i kartmeter på taket, till skärmen.
    const at = (x, y) => toScreen((x - x0) / dx, (y - y0) / dy)
    ctx.save()
    begin()
    for (const ring of screenRings) {
      ring.forEach((p, i) => (i === 0 ? M(p.x, p.ty) : L(p.x, p.ty)))
      Z()
    }
    clipPath('evenodd')
    begin()
    ctx.strokeStyle = `rgba(${GRAPHITE}, 0.32)`
    ctx.lineWidth = 0.8
    if (ROOF_PATTERN === 'gable') {
      // Sadeltak: nocken längs takets långa sida, och ena halvan lite mörkare.
      const alongX = dx >= dy
      const ridge = alongX ? [at(x0, (y0 + y1) / 2), at(x1, (y0 + y1) / 2)] : [at((x0 + x1) / 2, y0), at((x0 + x1) / 2, y1)]
      const far = alongX ? [at(x1, y1), at(x0, y1)] : [at(x1, y1), at(x1, y0)]
      M(ridge[0][0], ridge[0][1])
      L(ridge[1][0], ridge[1][1])
      L(far[0][0], far[0][1])
      L(far[1][0], far[1][1])
      Z()
      ctx.fillStyle = `rgba(${GRAPHITE}, 0.14)`
      fillPath()
      begin()
      M(ridge[0][0], ridge[0][1])
      L(ridge[1][0], ridge[1][1])
      ctx.strokeStyle = INK
      ctx.lineWidth = LINE_WIDTH
      strokePath()
    } else if (ROOF_PATTERN === 'tiles' || ROOF_PATTERN === 'dots') {
      const step = Math.max(ROOF_PATTERN === 'tiles' ? 1.4 : 2, spacing * sparser * 0.8)
      const rows = Math.ceil(dy / step)
      const columns = Math.ceil(dx / step)
      if (rows * columns <= 2500) {
        for (let row = 0; row <= rows; row++) {
          const y = y0 + row * step
          if (ROOF_PATTERN === 'tiles') {
            const [ax, ay] = at(x0, y)
            const [bx, by] = at(x1, y)
            M(ax, ay)
            L(bx, by)
          }
          for (let column = 0; column <= columns; column++) {
            const x = x0 + (column + (row % 2 ? 0.5 : 0)) * step
            const [px, py] = at(x, y)
            if (ROOF_PATTERN === 'tiles') {
              const [qx, qy] = at(x, y + step)
              M(px, py)
              L(qx, qy)
            } else {
              M(px - 0.9, py)
              L(px, py - 0.9)
              L(px + 0.9, py)
              L(px, py + 0.9)
              Z()
            }
          }
        }
        if (ROOF_PATTERN === 'dots') {
          ctx.fillStyle = `rgba(${GRAPHITE}, 0.42)`
          fillPath()
        } else {
          strokePath()
        }
      }
    } else if (ROOF_PATTERN === 'crosshatch') {
      const step = Math.max(1.5, spacing * sparser * 1.3)
      const size = Math.max(dx, dy)
      if (size / step <= 300) {
        for (let k = -size; k <= size; k += step) {
          for (const sign of [1, -1]) {
            const [ax, ay] = at(x0 + k, sign > 0 ? y0 : y1)
            const [bx, by] = at(x0 + k + size, sign > 0 ? y0 + size : y1 - size)
            M(ax, ay)
            L(bx, by)
          }
        }
        strokePath()
      }
    }
    ctx.restore()
  }

  // Snedstreck på en vägg mellan fotens hörn a och b, `meters` hög och
  // `length` meter lång. Strecken går 45 grader i väggens eget plan (räknat i
  // meter från hörnet a), så de följer med väggen när kartan rör sig. Varje
  // streck kortas av matematiskt vid väggens sidor i stället för med clip(),
  // som är långsamt när det görs för tusentals väggar per bildruta.
  function hatchWall(a, b, length, meters, every, color) {
    if (length < 0.5 || meters < 0.5) return
    // Liten vägg på skärmen: inga streck, bara fyllning och kontur.
    if (Math.abs(b.x - a.x) < MIN_HATCH_PX && Math.abs(b.y - a.y) < MIN_HATCH_PX) return
    if (Math.max(a.y - a.ty, b.y - b.ty) < MIN_HATCH_PX) return
    // Punkt på väggen: s = andel längs foten, h = andel uppåt.
    const atX = (s) => a.x + (b.x - a.x) * s
    const atY = (s, h) => {
      const base = a.y + (b.y - a.y) * s
      const roof = a.ty + (b.ty - a.ty) * s
      return base + (roof - base) * h
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 0.8
    begin()
    // Strecket k: s = (k * every + h * meters) / length, för h från 0 till 1.
    // Bara delen där 0 <= s <= 1 ligger på väggen.
    const slope = meters / length
    for (let k = Math.floor(-meters / every); k <= Math.ceil(length / every); k++) {
      const s0 = (k * every) / length
      const hLo = Math.max(0, -s0 / slope)
      const hHi = Math.min(1, (1 - s0) / slope)
      if (hLo >= hHi) continue
      const sLo = s0 + slope * hLo
      const sHi = s0 + slope * hHi
      M(atX(sLo), atY(sLo, hLo))
      L(atX(sHi), atY(sHi, hHi))
    }
    strokePath()
  }

  // Snedstreck på ett tak, fästa i kartans koordinater (linjer där x + y är
  // en multipel av avståndet), lyfta `top` pixlar. Ritas inom taket (clip).
  function hatchRoof(roof, screenRings, top, every) {
    const { uMin, uMax, vMin, vMax, x0, x1, y0, y1 } = roof
    if ((uMax - uMin) / every > 400) return // orimligt stort tak, hoppa över
    if (x1 - x0 < 0.1 || y1 - y0 < 0.1) return
    // Taket är plant, så kartmeter -> skärm är en projektiv avbildning. Räkna
    // ut den en gång från takets rektangel i stället för att fråga kartan om
    // varje streck (det var för långsamt).
    const corner = (x, y) => {
      const p = map.project(fromMeters(x, y))
      return { x: p.x, y: p.y - top }
    }
    const c00 = corner(x0, y0)
    const c11 = corner(x1, y1)
    // Litet tak på skärmen: inga streck.
    if (Math.abs(c11.x - c00.x) < MIN_HATCH_PX && Math.abs(c11.y - c00.y) < MIN_HATCH_PX) return
    const toScreen = squareToQuad(c00, corner(x1, y0), c11, corner(x0, y1))
    const onScreen = (u, v) => {
      const x = (u + v) / 2
      const y = (u - v) / 2
      return toScreen((x - x0) / (x1 - x0), (y - y0) / (y1 - y0))
    }
    ctx.save()
    begin()
    for (const ring of screenRings) {
      ring.forEach((p, i) => (i === 0 ? M(p.x, p.ty) : L(p.x, p.ty)))
      Z()
    }
    clipPath('evenodd')
    ctx.strokeStyle = HATCH.roof.color
    ctx.lineWidth = 0.8
    begin()
    for (let k = Math.ceil(uMin / every); k * every <= uMax; k++) {
      const [ax, ay] = onScreen(k * every, vMin)
      const [bx, by] = onScreen(k * every, vMax)
      M(ax, ay)
      L(bx, by)
    }
    strokePath()
    ctx.restore()
  }

  // Blyertskontur som darrar lite: väggens fot och sidor, i den aktuella
  // sökvägen. Överkanten ritas med takets kontur, som darrar likadant
  // eftersom darret hör till hörnen.
  function wallOutline(a, b) {
    const ax = a.x + a.pt.jx
    const bx = b.x + b.pt.jx
    M(ax, a.ty + a.pt.jy)
    L(ax, a.y + a.pt.jy)
    L(bx, b.y + b.pt.jy)
    L(bx, b.ty + b.pt.jy)
  }

  // Takets kontur. Klippkanter mellan kartrutorna hoppas över.
  function roofStroke(polygon, screenRings) {
    ctx.strokeStyle = INK
    ctx.lineWidth = LINE_WIDTH
    begin()
    screenRings.forEach((ring, ringIndex) => {
      const { seam } = polygon.rings[ringIndex]
      for (let i = 0; i < ring.length - 1; i++) {
        if (seam[i]) continue
        const a = ring[i]
        const b = ring[i + 1]
        M(a.x + a.pt.jx, a.ty + a.pt.jy)
        L(b.x + b.pt.jx, b.ty + b.pt.jy)
      }
    })
    outlinePath()
  }

  refreshWhileMoving(map, () => map.getZoom() >= 14 && refresh())
  map.on('move', render)
  map.on('resize', render)
  redraw = render
  // När kartan har stannat: husen hämtas i första bildrutan där rutorna i bild
  // är klara, i stället för att vänta på idle (som också väntar på att namnen
  // har tonat in, några tiondelar till). Inte vid själva moveend, för vid
  // jumpTo kommer det innan kartan har bytt rutor.
  function refreshWhenLoaded() {
    if (!map.isMoving() && !map.areTilesLoaded()) return
    map.off('render', refreshWhenLoaded)
    if (!map.isMoving()) refresh()
  }
  map.on('moveend', () => {
    if (map.getZoom() < 14) return
    map.off('render', refreshWhenLoaded)
    map.on('render', refreshWhenLoaded)
  })
  // Sista chansen, om rutorna kom medan kartan rörde sig.
  map.on('idle', refresh)
}
