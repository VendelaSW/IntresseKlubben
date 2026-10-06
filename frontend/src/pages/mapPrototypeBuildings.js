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

// Kopplar de skissade husen till kartan. `canvas` är ritytan ovanpå kartan.
export function attachSketchedBuildings(map, canvas) {
  const ctx = canvas.getContext('2d')
  let buildings = [] // { polygons: [[ring...]], height, base }

  // Hämtar husen som kartan har i bild.
  function refresh() {
    if (!map.getLayer(LAYER_ID)) return
    buildings = map.queryRenderedFeatures({ layers: [LAYER_ID] }).map((f) => ({
      polygons: rings(f.geometry),
      height: f.properties.render_height ?? 5,
      base: f.properties.render_min_height ?? 0,
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
    const marginLng = (bounds.getEast() - bounds.getWest()) * 0.15
    const marginLat = (bounds.getNorth() - bounds.getSouth()) * 0.15
    const inView = ([lng, lat]) =>
      lng >= bounds.getWest() - marginLng &&
      lng <= bounds.getEast() + marginLng &&
      lat >= bounds.getSouth() - marginLat &&
      lat <= bounds.getNorth() + marginLat
    const limit = 3 * Math.max(canvas.clientWidth, canvas.clientHeight)

    // Projicera alla hus: fot (marken) och tak för varje hörn.
    const projected = []
    for (const building of buildings) {
      for (const polygon of building.polygons) {
        const first = polygon[0]?.[0]
        if (!first || !polygon[0].every(inView)) continue
        const depth = pixelsPerMeter(map, first) / centerScale
        const lift = upAtCenter * depth
        const top = building.height * lift
        const bottom = building.base * lift
        const ringsOnScreen = polygon.map((ring) =>
          ring.map(([lng, lat]) => {
            const p = map.project([lng, lat])
            return { lng, lat, x: p.x, y: p.y - bottom, ty: p.y - top }
          }),
        )
        const outer = ringsOnScreen[0]
        // Säkerhetsnät: hoppa över hus som ändå hamnar orimligt långt bort.
        if (outer.some((p) => Math.abs(p.x) > limit || Math.abs(p.ty) > limit)) continue
        const maxY = Math.max(...outer.map((p) => p.y))
        projected.push({
          ringsOnScreen,
          height: top - bottom,
          meters: (building.height - building.base) * grown,
          top,
          maxY,
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
    ctx.fillStyle = SHADOW_FILL
    for (const { ringsOnScreen, height } of projected) {
      const dx = SHADOW.x * height
      const dy = SHADOW.y * height
      const outer = ringsOnScreen[0]
      ctx.beginPath()
      for (let i = 0; i < outer.length - 1; i++) {
        const a = outer[i]
        const b = outer[i + 1]
        // Ett parallellogram per kant, från foten till skuggans tak.
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.lineTo(b.x + dx, b.y + dy)
        ctx.lineTo(a.x + dx, a.y + dy)
        ctx.closePath()
      }
      ctx.fill('nonzero')
    }

    // 2. Husen, ett i taget bakifrån och fram.
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const building of projected) {
      const { ringsOnScreen } = building
      // Väggarna som vetter mot betraktaren.
      const walls = []
      ringsOnScreen.forEach((ring, ringIndex) => {
        let area = 0
        for (let i = 0; i < ring.length - 1; i++) area += ring[i].x * ring[i + 1].y - ring[i + 1].x * ring[i].y
        const toInside = Math.sign(area) || 1
        const isHole = ringIndex > 0
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i]
          const b = ring[i + 1]
          if (isTileSeam([a.lng, a.lat], [b.lng, b.lat])) continue
          // Normalen ut från huset: bort från ringens insida, eller in i
          // ett hål (en innergård).
          const nx = -(b.y - a.y) * toInside * (isHole ? 1 : -1)
          const ny = (b.x - a.x) * toInside * (isHole ? 1 : -1)
          if (ny <= 0) continue // väggen vetter bort från betraktaren
          walls.push({ a, b, lit: nx < 0, depth: (a.y + b.y) / 2 })
        }
      })
      walls.sort((w1, w2) => w1.depth - w2.depth)
      for (const { a, b, lit } of walls) {
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.lineTo(b.x, b.ty)
        ctx.lineTo(a.x, a.ty)
        ctx.closePath()
        ctx.fillStyle = lit ? WALL_LIT : WALL_DARK
        ctx.fill()
        hatchWall(a, b, building.meters, spacing * (lit ? HATCH.lit.every : HATCH.dark.every), lit ? HATCH.lit : HATCH.dark)
        sketchStroke([a, b, { ...b, y: b.ty }, { ...a, y: a.ty }], true)
      }

      // Taket överst.
      ctx.beginPath()
      for (const ring of ringsOnScreen) {
        ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.ty) : ctx.lineTo(p.x, p.ty)))
        ctx.closePath()
      }
      ctx.fillStyle = ROOF
      ctx.fill('evenodd')
      hatchRoof(ringsOnScreen, building.top, spacing * HATCH.roof.every)
      for (const ring of ringsOnScreen) {
        const edges = ring.map((p) => ({ ...p, y: p.ty }))
        sketchStroke(edges, false, ring)
      }
    }
  }

  // Snedstreck på en vägg mellan fotens hörn a och b, `meters` hög. Strecken
  // går 45 grader i väggens eget plan (räknat i meter från hörnet a), så de
  // följer med väggen när kartan rör sig. Ritas inom väggen (clip).
  function hatchWall(a, b, meters, every, { color }) {
    const length = Math.hypot(...toMeters(b.lng, b.lat).map((v, i) => v - toMeters(a.lng, a.lat)[i]))
    if (length < 0.5 || meters < 0.5) return
    // Punkt på väggen: s = andel längs foten, h = andel uppåt.
    const at = (s, h) => {
      const x = a.x + (b.x - a.x) * s
      const base = a.y + (b.y - a.y) * s
      const roof = a.ty + (b.ty - a.ty) * s
      return [x, base + (roof - base) * h]
    }
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(b.x, b.ty)
    ctx.lineTo(a.x, a.ty)
    ctx.closePath()
    ctx.clip()
    ctx.strokeStyle = color
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let k = Math.floor(-meters / every); k <= Math.ceil(length / every); k++) {
      // Strecket s * längd - h * höjd = k * avstånd, från foten till taket.
      ctx.moveTo(...at((k * every) / length, 0))
      ctx.lineTo(...at((k * every + meters) / length, 1))
    }
    ctx.stroke()
    ctx.restore()
  }

  // Snedstreck på ett tak, fästa i kartans koordinater (linjer där x + y är
  // en multipel av avståndet), lyfta `top` pixlar. Ritas inom taket (clip).
  function hatchRoof(ringsOnScreen, top, every) {
    const outer = ringsOnScreen[0]
    const sums = outer.map((p) => {
      const [x, y] = toMeters(p.lng, p.lat)
      return { u: x + y, v: x - y }
    })
    const uMin = Math.min(...sums.map((q) => q.u))
    const uMax = Math.max(...sums.map((q) => q.u))
    const vMin = Math.min(...sums.map((q) => q.v))
    const vMax = Math.max(...sums.map((q) => q.v))
    if ((uMax - uMin) / every > 400) return // orimligt stort tak, hoppa över
    // Taket är plant, så kartmeter -> skärm är en projektiv avbildning. Räkna
    // ut den en gång från takets rektangel i stället för att fråga kartan om
    // varje streck (det var för långsamt).
    const xs = outer.map((p) => toMeters(p.lng, p.lat)[0])
    const ys = outer.map((p) => toMeters(p.lng, p.lat)[1])
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    if (x1 - x0 < 0.1 || y1 - y0 < 0.1) return
    const corner = (x, y) => {
      const p = map.project(fromMeters(x, y))
      return { x: p.x, y: p.y - top }
    }
    const toScreen = squareToQuad(corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1))
    const onScreen = (u, v) => {
      const x = (u + v) / 2
      const y = (u - v) / 2
      return toScreen((x - x0) / (x1 - x0), (y - y0) / (y1 - y0))
    }
    ctx.save()
    ctx.beginPath()
    for (const ring of ringsOnScreen) {
      ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.ty) : ctx.lineTo(p.x, p.ty)))
      ctx.closePath()
    }
    ctx.clip('evenodd')
    ctx.strokeStyle = HATCH.roof.color
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let k = Math.ceil(uMin / every); k * every <= uMax; k++) {
      ctx.moveTo(...onScreen(k * every, vMin))
      ctx.lineTo(...onScreen(k * every, vMax))
    }
    ctx.stroke()
    ctx.restore()
  }

  // Blyertskontur som darrar lite. `closed` för väggar; för tak hoppas
  // klippkanter mellan kartrutorna över.
  function sketchStroke(points, closed, source) {
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.2
    ctx.beginPath()
    const count = closed ? points.length : points.length - 1
    for (let i = 0; i < count; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (source && isTileSeam([source[i].lng, source[i].lat], [source[i + 1].lng, source[i + 1].lat])) continue
      ctx.moveTo(a.x + jitter(a.lng, a.lat, i), a.y + jitter(a.lat, a.lng, i))
      ctx.lineTo(b.x + jitter(b.lng, b.lat, i + 1), b.y + jitter(b.lat, b.lng, i + 1))
    }
    ctx.stroke()
  }

  map.on('move', render)
  map.on('resize', render)
  map.on('idle', refresh)
}
