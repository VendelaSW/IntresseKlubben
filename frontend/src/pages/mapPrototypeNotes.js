import { FIGURE_HEIGHT_PX } from './mapPrototypeDoodles'

// PROTOTYP: post-it-lappar med information om platser på kartan (ikonerna i
// lagret "places"). Lapparna ligger på kartans yta och draperas över 3D-husen:
// lappen är ett rutnät med kartkoordinater, varje hörn lyfts till höjden på
// huset under det, och vid varje kartrörelse sträcks varje ruta ut mellan
// sina hörn på skärmen. Då följer storlek, plats och perspektiv kartan exakt,
// och lappen är fortfarande vanlig HTML (länkar och krysset går att klicka på).
//   Hovra: en förhandslapp med det kartdatan har (namn och typ).
//   Klicka: lappen klistras fast och mer hämtas från OpenStreetMap
//   (öppettider, adress, telefon, webbplats). Flera lappar kan sitta samtidigt;
//   krysset på lappen tar bort den.
// Hovrar man lyfts också figuren lite från pappret (feature-state "hover",
// som skyltarna i mapPrototypeSigns.js läser).
// Uppgifterna kan vara inaktuella - de kommer från frivilliga - så det står
// på lappen.
//
// Obs: i en riktig version ska backend hämta och spara detta i stället för
// att webbläsaren frågar OpenStreetMap direkt (deras servrar är inte till
// för trafik från appar).

// Vad platsen är, på svenska. Först efter typ+undertyp (t.ex. att en
// konstgalleri-punkt är ett konstverk utomhus), sedan bara efter typ.
const SUBTYPE_LABELS = {
  'art_gallery/artwork': 'Konstverk',
  'art_gallery/arts_centre': 'Konsthall',
  'town_hall/community_centre': 'Träffpunkt',
  'attraction/viewpoint': 'Utsiktsplats',
  'fast_food/food_court': 'Matsal',
}

const TYPE_LABELS = {
  // Sport
  pitch: 'Plan',
  sports_centre: 'Sporthall',
  swimming_pool: 'Bad',
  ice_rink: 'Ishall',
  climbing: 'Klättring',
  judo: 'Judo',
  stadium: 'Arena',
  golf: 'Golfbana',
  // Fika och mat
  cafe: 'Kafé',
  restaurant: 'Restaurang',
  fast_food: 'Snabbmat',
  beer: 'Pub',
  bar: 'Bar',
  ice_cream: 'Glass',
  bakery: 'Bageri',
  // Kultur
  library: 'Bibliotek',
  museum: 'Museum',
  art_gallery: 'Galleri',
  theatre: 'Teater',
  cinema: 'Bio',
  music: 'Musik',
  // Natur
  park: 'Park',
  picnic_site: 'Picknickplats',
  garden: 'Trädgård',
  swimming: 'Badplats',
  // Lek
  playground: 'Lekplats',
}

// Vilken sorts plan, från kartdatans "subclass".
const PITCH_LABELS = {
  soccer: 'Fotbollsplan',
  bandy: 'Bandyplan',
  archery: 'Bågskytte',
  tennis: 'Tennisbana',
  basketball: 'Basketplan',
  multi: 'Multisportplan',
  ice_hockey: 'Ishockeyrink',
  handball: 'Handbollsplan',
  padel: 'Padelbana',
  boules: 'Boulebana',
  athletics: 'Friidrottsbana',
}

const DAYS = { Mo: 'mån', Tu: 'tis', We: 'ons', Th: 'tor', Fr: 'fre', Sa: 'lör', Su: 'sön' }

function typeLabel(props) {
  if (props.class === 'pitch') return PITCH_LABELS[props.subclass] ?? TYPE_LABELS.pitch
  return SUBTYPE_LABELS[`${props.class}/${props.subclass}`] ?? TYPE_LABELS[props.class] ?? 'Plats'
}

// "Mo-Fr 09:00-18:00; Sa 10:00-15:00" -> en rad per del, med svenska dagar.
function openingHoursLines(value) {
  return value
    .split(';')
    .map((part) => part.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => DAYS[d]))
    .filter(Boolean)
}

// Kartdatans id är OpenStreetMaps id * 10 + typ (1 = node, 2 = way, 3 = relation).
function osmUrl(featureId) {
  const kind = { 1: 'node', 2: 'way', 3: 'relation' }[featureId % 10]
  if (!kind) return null
  return `https://api.openstreetmap.org/api/0.6/${kind}/${Math.floor(featureId / 10)}.json`
}

const detailsCache = new Map()

async function fetchDetails(featureId) {
  if (detailsCache.has(featureId)) return detailsCache.get(featureId)
  const url = osmUrl(featureId)
  const tags = url
    ? await fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.elements?.[0]?.tags ?? {})
        .catch(() => null)
    : {}
  if (tags) detailsCache.set(featureId, tags)
  return tags
}

// Bygger lappen med DOM-element och textContent (inte innerHTML), eftersom
// texten kommer utifrån och inte ska kunna innehålla kod.
function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function noteContent(props, details) {
  const note = el('div', 'map-note')
  note.append(el('p', 'map-note-title', props.name ?? typeLabel(props)))
  if (props.name) note.append(el('p', 'map-note-type', typeLabel(props)))

  if (details === 'loading') {
    note.append(el('p', 'map-note-hint', 'Hämtar mer...'))
    return note
  }
  if (details === null) {
    note.append(el('p', 'map-note-hint', 'Kunde inte hämta mer information.'))
    return note
  }
  if (!details) {
    note.append(el('p', 'map-note-hint', 'Klicka för mer information'))
    return note
  }

  const rows = el('dl', 'map-note-rows')
  const add = (label, value) => {
    if (!value) return
    rows.append(el('dt', null, label))
    const dd = el('dd')
    if (value instanceof Node) dd.append(value)
    else dd.textContent = value
    rows.append(dd)
  }

  if (details.opening_hours) {
    const list = el('span', 'map-note-hours')
    openingHoursLines(details.opening_hours).forEach((line, i) => {
      if (i > 0) list.append(document.createElement('br'))
      list.append(line)
    })
    add('Öppet', list)
  }
  const street = [details['addr:street'], details['addr:housenumber']].filter(Boolean).join(' ')
  const place = [details['addr:postcode'], details['addr:city']].filter(Boolean).join(' ')
  add('Adress', [street, place].filter(Boolean).join(', '))
  add('Telefon', details.phone ?? details['contact:phone'])
  const website = details.website ?? details['contact:website']
  if (website && /^https?:\/\//.test(website)) {
    const link = el('a', null, website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))
    link.href = website
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    add('Webb', link)
  }
  const extras = []
  if (details.wheelchair === 'yes') extras.push('rullstolsanpassat')
  if (details.outdoor_seating === 'yes' || details.al_fresco === 'yes') extras.push('uteservering')
  add('Bra att veta', extras.join(', '))

  if (rows.childElementCount > 0) note.append(rows)
  else note.append(el('p', 'map-note-hint', 'Inga fler uppgifter finns.'))
  note.append(el('p', 'map-note-source', 'Från OpenStreetMap, kan vara inaktuellt.'))
  return note
}

// --- Lappens hörn på kartan ---

const EARTH_CIRCUMFERENCE = 40075016.686 // meter
const METERS_PER_DEGREE_LAT = 111320
// Avstånd mellan lappens nedre kant och platsen, i pixlar på skärmen när
// lappen sattes dit: lite mer än pop-up-figuren är hög, så att lappen inte
// täcker den. Figuren står upp men avståndet ligger längs den lutade marken,
// där allt ser kortare ut, så det delas med cos(lutningen).
function gapPx(map) {
  return (FIGURE_HEIGHT_PX + 4) / Math.cos((map.getPitch() * Math.PI) / 180)
}

// Hur många meter en skärmpixel motsvarar på en viss zoom och latitud
// (MapLibre räknar med 512 pixlar breda rutor).
function metersPerPixel(zoom, lat) {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)
}

// Flyttar en punkt [lng, lat] x meter österut och y meter norrut.
function offsetMeters([lng, lat], x, y) {
  return [lng + x / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180)), lat + y / METERS_PER_DEGREE_LAT]
}

// Lappen delas i ett rutnät, så att den kan böja sig över husen. Fler rutor
// ger mjukare böjar men mer att räkna om när kartan rör sig.
const COLS = 12
const ROWS = 8

// Rutnätets hörn på kartan, rad för rad uppifrån (bortre kanten) och ned
// (närmaste kanten): (ROWS + 1) x (COLS + 1) punkter [lng, lat]. Lappen är
// lika stor på kartan som den var på skärmen när den sattes dit, står med
// nedre kanten strax norr om platsen, och är vriden `turn` grader runt nedre
// kantens mitt.
function noteGrid(place, widthPx, heightPx, gapPixels, zoom, turn) {
  const mpp = metersPerPixel(zoom, place[1])
  const w = widthPx * mpp
  const h = heightPx * mpp
  const gap = gapPixels * mpp
  const a = (turn * Math.PI) / 180
  const grid = []
  for (let row = 0; row <= ROWS; row++) {
    const line = []
    for (let col = 0; col <= COLS; col++) {
      const x = -w / 2 + (col * w) / COLS
      const y = h - (row * h) / ROWS
      // Vrid runt nedre kantens mitt (0, 0), sedan flytta upp ovanför platsen.
      const rx = x * Math.cos(a) - y * Math.sin(a)
      const ry = x * Math.sin(a) + y * Math.cos(a)
      line.push(offsetMeters(place, rx, ry + gap))
    }
    grid.push(line)
  }
  return grid
}

// --- Husens höjd under lappen ---

// Ligger punkten [lng, lat] i ringen (yttre ring; hål räknas inte)?
function insideRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function outerRings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0])
  return []
}

// Hur brant pappret får luta (meter upp per meter i sidled). Lappen är som
// styvt papper: den kan inte vika sig rakt ned längs en vägg. Med kartan lutad
// 45 grader viker sig en ruta dubbelt om lutningen mot betraktaren blir
// brantare än 1, så gränsen ligger en bit under det.
const MAX_SLOPE = 0.7

// Avstånd i meter mellan två närliggande punkter [lng, lat].
function metersBetween([lng1, lat1], [lng2, lat2]) {
  const kx = METERS_PER_DEGREE_LAT * Math.cos((lat1 * Math.PI) / 180)
  return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * METERS_PER_DEGREE_LAT)
}

// Höjden (meter) under varje hörn i rutnätet: det högsta huset som punkten
// ligger i, annars 0. Sedan:
//   1. Lutningen begränsas till MAX_SLOPE genom att låga hörn bredvid höga
//      lyfts, så att pappret sluttar som ett tält ned från taket i stället
//      för att vika sig.
//   2. Ett varv utjämning, så att övergångarna blir mjuka.
function sampleHeights(map, grid) {
  const points = grid.flat()
  const margin = 0.001
  const west = Math.min(...points.map((p) => p[0])) - margin
  const east = Math.max(...points.map((p) => p[0])) + margin
  const south = Math.min(...points.map((p) => p[1])) - margin
  const north = Math.max(...points.map((p) => p[1])) + margin
  const near = ([x, y]) => x >= west && x <= east && y >= south && y <= north
  const buildings = map
    .querySourceFeatures('openmaptiles', { sourceLayer: 'building' })
    .map((f) => ({ height: f.properties.render_height ?? 5, rings: outerRings(f.geometry) }))
    .filter(({ rings }) => rings.some((ring) => ring.some(near)))

  const heightAt = (point) =>
    buildings.reduce((max, b) => (b.rings.some((ring) => insideRing(point, ring)) ? Math.max(max, b.height) : max), 0)
  let heights = grid.map((line) => line.map(heightAt))

  // 1. Begränsa lutningen. Lyft ett hörn om ett grannhörn är så mycket högre
  // att pappret mellan dem skulle bli för brant; upprepa tills inget ändras
  // (som mest en gång per rad och kolumn räcker för att nå hela rutnätet).
  const across = metersBetween(grid[0][0], grid[0][1]) // en ruta i sidled
  const along = metersBetween(grid[0][0], grid[1][0]) // en ruta framåt/bakåt
  const neighbours = [
    [0, 1, across],
    [0, -1, across],
    [1, 0, along],
    [-1, 0, along],
  ]
  for (let round = 0; round < ROWS + COLS; round++) {
    let changed = false
    for (let r = 0; r < heights.length; r++) {
      for (let c = 0; c < heights[r].length; c++) {
        for (const [dr, dc, distance] of neighbours) {
          const other = heights[r + dr]?.[c + dc]
          if (other === undefined) continue
          const lowest = other - MAX_SLOPE * distance
          if (heights[r][c] < lowest) {
            heights[r][c] = lowest
            changed = true
          }
        }
      }
    }
    if (!changed) break
  }

  // 2. Utjämna ett varv.
  return heights.map((line, r) =>
    line.map((_, c) => {
      let sum = 0
      let count = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const value = heights[r + dr]?.[c + dc]
          if (value !== undefined) {
            sum += value
            count++
          }
        }
      }
      return sum / count
    }),
  )
}

// CSS-transform som sträcker ett element (bredd w, höjd h) så att dess hörn
// hamnar på fyra skärmpunkter (projektiv avbildning, "homografi").
function quadTransform(w, h, [p0, p1, p2, p3]) {
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const k = (dx1 * dy3 - dx3 * dy1) / den
  const a = p1.x - p0.x + g * p1.x
  const b = p3.x - p0.x + k * p3.x
  const d = p1.y - p0.y + g * p1.y
  const e = p3.y - p0.y + k * p3.y
  return `matrix3d(${a / w}, ${d / w}, 0, ${g / w}, ${b / h}, ${e / h}, 0, ${k / h}, 0, 0, 1, 0, ${p0.x}, ${p0.y}, 0, 1)`
}

// Är fyrhörningen (skärmpunkter i ordning runt kanten) konvex och vänd åt rätt
// håll? Annars blir sträckningen av en ruta helt förvriden.
function isProperQuad(points) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = points[i]
    const b = points[(i + 1) % 4]
    const c = points[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-6) return false
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return sign > 0
}

// Flyttar skärmpunkter en halv pixel ut från sin mitt, så att det inte blir
// glipor mellan rutorna.
function grow(points, by = 0.5) {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return points.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const length = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / length) * by, y: p.y + (dy / length) * by }
  })
}

// En lapp på kartan som ligger draperad över husen. Lappen ritas som ett
// rutnät av små rutor; varje ruta visar sin bit av lappen (en kopia av
// innehållet, förskjuten och avklippt) och sträcks ut mellan sina fyra hörn,
// som lyfts till husens höjd. `onClose` anropas när man klickar på krysset.
function createNote(map, layer, feature, zoom, onClose) {
  const element = el('div', 'map-note-stuck')
  layer.append(element)
  const place = feature.geometry.coordinates
  // Lite olika lutning per plats, så att lapparna ser handklistrade ut.
  const turn = ((feature.id ?? 0) % 7) - 3
  let grid = null
  let heights = null
  let size = null
  let cells = []

  // Innehållet kopieras till varje ruta, så krysset hanteras här för alla.
  element.addEventListener('click', (event) => {
    if (event.target.closest('.map-note-close')) {
      event.stopPropagation()
      onClose?.()
    }
  })

  function position() {
    if (!grid) return
    // Husen växer upp mellan zoom 14 och 15 (se buildings-3d), så lappen
    // lyfts lika mycket.
    const grown = Math.min(1, Math.max(0, map.getZoom() - 14))
    // Hur många pixlar en meter är vid platsen, och hur mycket en höjd syns
    // uppåt på skärmen när kartan lutar.
    const origin = map.project(place)
    const east = map.project(offsetMeters(place, 1, 0))
    const pixelsPerMeter = Math.hypot(east.x - origin.x, east.y - origin.y)
    const lift = pixelsPerMeter * Math.sin((map.getPitch() * Math.PI) / 180) * grown
    const points = grid.map((line, r) =>
      line.map((lngLat, c) => {
        const p = map.project(lngLat)
        return { x: p.x, y: p.y - heights[r][c] * lift }
      }),
    )
    const cw = size.w / COLS
    const ch = size.h / ROWS
    for (const { cell, r, c } of cells) {
      const corners = [points[r][c], points[r][c + 1], points[r + 1][c + 1], points[r + 1][c]]
      // Säkerhetsnät: en ruta som ändå blivit vriden göms hellre än ritas trasig.
      if (!isProperQuad(corners)) {
        cell.style.visibility = 'hidden'
        continue
      }
      cell.style.visibility = ''
      cell.style.transform = quadTransform(cw, ch, grow(corners))
    }
    // Närmare lappar (längre ned på skärmen) ovanpå lappar längre bort.
    element.style.zIndex = Math.round(origin.y)
  }

  // Läser husens höjder igen, t.ex. när fler kartrutor har laddats.
  function resample() {
    if (!grid) return
    heights = sampleHeights(map, grid)
    position()
  }

  function setContent(content) {
    // Mät lappen platt först.
    const sheet = el('div', 'map-note-sheet')
    sheet.append(content)
    element.replaceChildren(sheet)
    size = { w: sheet.offsetWidth, h: sheet.offsetHeight }
    grid = noteGrid(place, size.w, size.h, gapPx(map), zoom, turn)

    // Bygg rutorna, bortre raden först så att närmare rutor hamnar ovanpå
    // där pappret böjer sig.
    const cw = size.w / COLS
    const ch = size.h / ROWS
    cells = []
    const pieces = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = el('div', 'map-note-cell')
        cell.style.width = `${cw}px`
        cell.style.height = `${ch}px`
        const copy = sheet.cloneNode(true)
        copy.style.transform = `translate(${-c * cw}px, ${-r * ch}px)`
        cell.append(copy)
        pieces.push(cell)
        cells.push({ cell, r, c })
      }
    }
    element.replaceChildren(...pieces)
    resample()
  }

  return { element, setContent, update: position, resample, remove: () => element.remove() }
}

// Kopplar lapparna till ett symbollager. `layer` är elementet lapparna läggs i.
export function attachPlaceNotes(map, layerId, layer) {
  let preview = null // förhandslappen när man hovrar
  let previewId = null
  const stuck = new Map() // id -> fastklistrad lapp

  map.on('move', () => {
    preview?.update()
    for (const note of stuck.values()) note.update()
  })
  // Nya kartrutor kan ha laddats in med fler hus.
  map.on('idle', () => {
    for (const note of stuck.values()) note.resample()
  })

  function removePreview() {
    preview?.remove()
    preview = null
    previewId = null
  }

  // Markerar figuren man hovrar över (feature-state), så att den ritas lyft.
  const POI = { source: 'openmaptiles', sourceLayer: 'poi' }
  let liftedId = null
  function lift(feature) {
    const id = feature?.id ?? null
    if (id === liftedId) return
    if (liftedId !== null) map.removeFeatureState({ ...POI, id: liftedId }, 'hover')
    if (id !== null) map.setFeatureState({ ...POI, id }, { hover: true })
    liftedId = id
  }

  map.on('mouseenter', layerId, (e) => {
    map.getCanvas().style.cursor = 'pointer'
    const feature = e.features[0]
    lift(feature)
    if (stuck.has(feature.id) || previewId === feature.id) return
    removePreview()
    previewId = feature.id
    preview = createNote(map, layer, feature, map.getZoom())
    preview.element.classList.add('map-note-preview')
    preview.setContent(noteContent(feature.properties))
  })
  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = ''
    lift(null)
    removePreview()
  })

  map.on('click', layerId, (e) => {
    const feature = e.features[0]
    const id = feature.id
    if (stuck.has(id)) return
    removePreview()

    const note = createNote(map, layer, feature, map.getZoom(), () => {
      note.remove()
      stuck.delete(id)
    })
    stuck.set(id, note)

    function render(details) {
      const content = noteContent(feature.properties, details)
      const close = el('button', 'map-note-close', '×')
      close.type = 'button'
      close.setAttribute('aria-label', 'Ta bort lappen')
      content.prepend(close)
      note.setContent(content)
    }

    render('loading')
    fetchDetails(id).then((details) => {
      if (stuck.get(id) === note) render(details)
    })
  })
}
