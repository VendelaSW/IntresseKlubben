// PROTOTYP: 3D-hus som ser skissade ut, ritade för hand med bläck och
// blyerts ovanpå kartan.
//
// MapLibres egna 3D-hus (fill-extrusion) kan bara fyllas med färg eller
// mönster, inte få bläcklinjer längs kanterna. Därför ritas husen här på en
// egen canvas ovanpå kartan, i kartans perspektiv:
//   - kartan ger husens form och höjd via ett osynligt lager ("building-shapes"),
//   - varje hus ritas med väggarna som vetter mot betraktaren och taket överst,
//   - hus längre bort ritas först och närmare ovanpå (målarens algoritm),
//   - allt ser blyertsritat ut på det gula blocket, som vattnet och Emmys
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

import { inSweden } from './mapPrototypeStyle'

const LAYER_ID = 'building-shapes'
// Blyerts på det gula blocket: grå grafit, så att husen blir mörkare än
// pappret. Ytorna är papprets gula färg med lite grafit i (täckande, så att
// hus längre bort inte syns igenom), taken ljusast och väggarna mörkare.
const GRAPHITE = '55, 53, 50'
const INK = 'rgba(40, 38, 35, 0.85)'
const ROOF = '#fbf0a9' // samma som blocket; taket får sin ton av skrafferingen
const WALL_LIT = '#f3e7a1'
const WALL_DARK = '#e3d592'
const SHADOW_FILL = `rgba(${GRAPHITE}, 0.16)`
// Skrafferingen: ungefärligt avstånd i pixlar mellan strecken (som vattnet),
// och hur mörka strecken är på tak, ljusa väggar och mörka väggar.
const HATCH_PX = 4.5
const HATCH = {
  roof: { every: 1.3, color: `rgba(${GRAPHITE}, 0.35)` },
  lit: { every: 1.4, color: `rgba(${GRAPHITE}, 0.4)` },
  dark: { every: 0.7, color: `rgba(${GRAPHITE}, 0.55)` },
}

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

// Pixlar per meter österut vid en plats.
function pixelsPerMeter(map, lngLat) {
  const east = [lngLat[0] + 1 / (111320 * Math.cos((lngLat[1] * Math.PI) / 180)), lngLat[1]]
  const a = map.project(lngLat)
  const b = map.project(east)
  return Math.hypot(b.x - a.x, b.y - a.y)
}


// Hur stort (i pixlar) en yta måste vara på skärmen för att få skraffering.
// Mindre hus syns ändå bara som prickar, och strecken kostar mest tid.
const MIN_HATCH_PX = 3
// Detaljnivå efter hur höga väggarna är på skärmen. Lägre än FLAT_PX: huset
// ritas platt (tak med kontur), alla sådana i ett enda anrop. Under
// DETAIL_PX: väggar och tak utan skraffering. Annars allt. Antalet
// ritanrop, inte räknandet, är det som kostar när tusentals hus syns.
const FLAT_PX = 3
const DETAIL_PX = 6

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
    return { rings: ringData, roof }
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

// Kopplar de skissade husen till kartan. `canvas` är ritytan ovanpå kartan.
export function attachSketchedBuildings(map, canvas) {
  const ctx = canvas.getContext('2d')
  let buildings = [] // från prepare()

  // Hämtar husen som kartan har i bild.
  function refresh() {
    if (!map.getLayer(LAYER_ID)) return
    buildings = map
      .queryRenderedFeatures({ layers: [LAYER_ID] })
      .map(prepare)
      .map((building) => ({
        ...building,
        polygons: building.polygons.filter(({ rings }) => {
          const first = rings[0]?.pts[0]
          return first && inSweden(first.lng, first.lat)
        }),
      }))
    render()
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1
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
        const top = building.height * lift
        const bottom = building.base * lift
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
          meters: (building.height - building.base) * grown,
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
    begin()
    for (const { screenRings, detail } of projected) {
      if (detail === 'flat') roofPath(screenRings)
    }
    // nonzero: samma hus kan komma två gånger (från två kartrutor), och med
    // evenodd skulle de ta ut varandra. Innergårdar syns inte så här små.
    ctx.fillStyle = ROOF
    fillPath('nonzero')
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.2
    strokePath()

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
          ctx.fillStyle = lit ? WALL_LIT : WALL_DARK
          fillPath()
        }
        begin()
        for (const w of walls) wallOutline(w.a, w.b)
        ctx.strokeStyle = INK
        ctx.lineWidth = 1.2
        strokePath()
      } else {
        walls.sort((w1, w2) => w1.depth - w2.depth)
        for (const { a, b, length, lit } of walls) {
          begin()
          wallPath(a, b)
          ctx.fillStyle = lit ? WALL_LIT : WALL_DARK
          fillPath()
          const style = lit ? HATCH.lit : HATCH.dark
          hatchWall(a, b, length, building.meters, spacing * building.sparser * style.every, style.color)
          begin()
          wallOutline(a, b)
          ctx.strokeStyle = INK
          ctx.lineWidth = 1.2
          strokePath()
        }
      }

      // Taket överst.
      begin()
      roofPath(screenRings)
      ctx.fillStyle = ROOF
      fillPath('evenodd')
      if (detail === 'full') {
        hatchRoof(polygon.roof, screenRings, building.top, spacing * building.sparser * HATCH.roof.every)
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
    ctx.lineWidth = 1.2
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
    strokePath()
  }

  map.on('move', render)
  map.on('resize', render)
  map.on('idle', refresh)
}
