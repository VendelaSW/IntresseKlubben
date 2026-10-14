import { useEffect, useRef, useState } from 'react'
import '../styles/map.css'
import { LngLat, Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addMissingDoodle } from './mapPrototypeDoodles'
import { attachPlaceNotes } from './mapPrototypeNotes'
import { attachSketchedBuildings } from './mapPrototypeBuildings'
import { attachPinsAndThread } from './mapPrototypeRoute'
import { attachPlaceSigns } from './mapPrototypeSigns'
import MapCalmPage from './MapCalmPage'
import MapPagePad, { MAP_PAGES } from './MapPagePad'
import MapPageWidgets from './MapPageWidgets'
import MapProfileWidget from './MapProfileWidget'
import mapStyle, { LANDSKAP_LABELS, LAN_LABELS, SWEDEN_RINGS, inSweden } from './mapPrototypeStyle'
import { getEvents } from '../services/events'
import { getGroups, getMyGroups } from '../services/groups'
import { getProfile } from '../services/profile'
import { activitiesFrom, attachActivityMarkers } from './mapPrototypeActivities'
import {
  ZOOM_LEVELS,
  allKommuner,
  isInside,
  kommunByCode,
  kommunerInLan,
  lanByCode,
  landskapAt,
  landskapMaskAt,
  landskapNameAt,
  landskapRings,
  lanCodeAt,
  lanRings,
  regionAt,
} from './mapPrototypeZoomLevels'

// PROTOTYP: "skattkarta ritad på ett gult block". Vektordata från
// OpenFreeMap (gratis, ingen API-nyckel), egen stil i mapPrototypeStyle.js.
// Lager uppifrån och ner:
//   - bordskant: mörk skugga runt kanterna (CSS)
//   - kompass och tips om nålarna (HTML ovanpå)
//   - kartnålar och en tråd mellan dem som visar vägen, ovanför kartan (SVG, se mapPrototypeRoute.js)
//   - post-it-lappar för platser, limmade på kartans yta (HTML, se mapPrototypeNotes.js)
//   - ortnamn i Caveat (HTML ovanpå, placerade med hjälp av kartan)
//   - husen, skissade i 3D (canvas, se mapPrototypeBuildings.js)
//   - platsernas pop-up-figurer, stående i perspektiv (HTML, se mapPrototypeSigns.js)
//   - kartan, genomskinlig och lutad
//   - blocket: gult papper med linjer, lutat lika mycket som kartan (CSS)
const GUSTAVSBERG = [18.389, 59.326] // [longitud, latitud]
// Appen gäller bara Sverige: Strömstad i väster, Smygehuk i söder,
// Haparanda i öster och Treriksröset i norr. [[väst, syd], [öst, nord]]
const SWEDEN_BOUNDS = [
  [10.9, 55.3],
  [24.2, 69.1],
]
// Landets yttersta punkter: Koster (väst), Smygehuk (syd), Haparanda (öst)
// och Treriksröset (nord). Används för att lägga Sverige mitt på skärmen.
const SWEDEN_EXTREMES = [
  [10.96, 58.9],
  [13.36, 55.34],
  [24.17, 65.84],
  [20.55, 69.06],
]
// Luft runt landet i pixlar när man har zoomat ut helt.
const FIT_PADDING = 24
// Hur nära helt utzoomat (i zoomnivåer) man ska vara för att kartan ska glida
// till landets mitt när man har slutat zooma.
const SETTLE_ZOOMS = 0.15

// Närmaste punkt på en gräns (ringar av [longitud, latitud]; longitud räknad
// i rätt skala för latituden, så att "närmast" stämmer i verkligheten).
function nearestOnRings(rings, lng, lat) {
  const k = Math.cos((lat * Math.PI) / 180)
  let best = null
  let bestDistance = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i]
      const [bx, by] = ring[i + 1]
      const dx = (bx - ax) * k
      const dy = by - ay
      const length = dx * dx + dy * dy
      const t = length ? Math.max(0, Math.min(1, ((lng - ax) * k * dx + (lat - ay) * dy) / length)) : 0
      const px = ax + (bx - ax) * t
      const py = ay + (by - ay) * t
      const distance = ((lng - px) * k) ** 2 + (lat - py) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = [px, py]
      }
    }
  }
  return best
}

// Var kartan får vara: aldrig längre ut än att hela Sverige syns (`fit`, från
// fitSweden), och kartans mitt (en osynlig prick mitt på skärmen) alltid
// innanför Sveriges gräns, eller innanför länets när ett län är valt (`lan`,
// länskod), så att man kan röra sig fritt i länet men inte lämna det. Drar
// man pricken utanför stannar den vid gränsen.
function constrainToSweden(fit, lngLat, zoom, lan) {
  if (!fit) return { center: lngLat, zoom }
  const z = Math.min(MAX_ZOOM, Math.max(zoom, fit.zoom))
  const inside = lan ? lanCodeAt([lngLat.lng, lngLat.lat]) === lan : inSweden(lngLat.lng, lngLat.lat)
  if (inside) return { center: lngLat, zoom: z }
  const [lng, lat] = nearestOnRings(lan ? lanRings(lan) : SWEDEN_RINGS, lngLat.lng, lngLat.lat)
  return { center: new LngLat(lng, lat), zoom: z }
}

// Kartan lutar som ett papper på ett bord. Vinkeln är låst, så att kartan
// (som MapLibre lutar i 3D) och blockets linjer (som lutas med CSS, se
// .map-sketch-paper) alltid ligger i samma plan.
const TILT = 45

// Platser i kartans data som en stadsdel i profilen kan matcha (fritext),
// och zoomen man hamnar på när den hittas.
const DISTRICT_CLASSES = ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood', 'hamlet', 'island']
// Zoomen för en kommun eller stadsdel: där de skissade husen har vuxit upp.
const DISTRICT_ZOOM = 15
// Zoomen för "Visa på kartan": lappen med sin omgivning.
const ACTIVITY_ZOOM = 11
// Längst in man kan zooma: kvarter med husen tydliga. Kartdatan har ingen
// mer detalj längre in (den förstoras bara), och husen blir bara större.
const MAX_ZOOM = 17
// Kommunens centralort hittas bland de här platserna i kartans data.
const TOWN_CLASSES = ['city', 'town']

// Jämför ortnamn: små bokstäver, utan extra mellanslag och skiljetecken.
const normalizePlace = (text) =>
  text
    .toLocaleLowerCase('sv')
    .replace(/[^a-zåäöéü0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Kartans nivåer. På 'sverige' och 'landskap' är zoomen låst: man tar sig
// vidare genom att klicka (på ett landskap, eller i landskapet för att komma
// till länet där) eller med + och −, som då stegar mellan nivåerna. På
// 'free' (län, kommun och närmare) zoomar man fritt, och nålarna finns bara
// där. Zoomar man ut förbi landskapets storlek fastnar kartan på landskapet.
const LEVEL_PADDING = 48 // luft runt området när man zoomar till en nivå
// Lager som döljs på Sverige-nivån, så att landskapen och deras namn syns
// tydligt: skog, vattnets skraffering, vattendrag och vägar. Kustlinjen och
// sjöarnas konturer, landskapens färger och gränser blir kvar, som i en atlas.
const HIDDEN_ON_SWEDEN = ['forest', 'forest-edge', 'water', 'waterway', 'roads-major']
// Landskapsvyn ser ut som Sverige-vyn (samma lager dolda), men med länen i
// stället för landskapen: landskapets egen färg och gräns döljs och länens
// visas.
const SHOWN_ON_LANDSKAP = ['lan-fill', 'lan-borders']
const HIDDEN_ON_LANDSKAP = [...HIDDEN_ON_SWEDEN, 'landskap-fill', 'landskap-borders']

// I länsvyn visas kommunernas namn utzoomat, och ortnamnen tar över mellan
// de här zoomnivåerna.
const KOMMUN_FADE = [9, 10]
const KOMMUN_NAME_SIZE = 15

// Utzoomat visas landskapens namn i stället för ortnamnen. De tonar över i
// varandra mellan de här zoomnivåerna.
const LANDSKAP_FADE = [6.5, 7.5]

const clamp01 = (value) => Math.min(1, Math.max(0, value))

// Landskapsnamnets storlek i pixlar: större landskap får större namn, och
// namnen växer lite när man zoomar in.
function landskapFontSize(km2, zoom) {
  const byArea = 9.5 + 3.4 * Math.log10(km2 / 1000)
  return Math.round(Math.min(24, Math.max(9, byArea * 2 ** ((zoom - 4.5) * 0.3))))
}

// Bredd i pixlar för ett landskapsnamn i en viss storlek: Caveat i fetstil,
// versaler, spärrat 0.12em (som .map-sketch-landskap), plus bakgrundens
// luft på sidorna. Mäts med en canvas och sparas.
const nameWidths = new Map()
let measureCtx = null
// Mätt innan Caveat hann laddas blir det fel bredd, så mät om när den finns.
document.fonts?.ready.then(() => nameWidths.clear())
function landskapNameWidth(name, size) {
  const key = `${name}|${size}`
  if (!nameWidths.has(key)) {
    measureCtx ??= document.createElement('canvas').getContext('2d')
    measureCtx.font = `700 ${size}px Caveat, cursive`
    const text = name.toUpperCase()
    nameWidths.set(key, measureCtx.measureText(text).width + text.length * size * 0.12 + size * 0.7)
  }
  return nameWidths.get(key)
}

// Var ett landskapsnamn ska stå, utan att krocka med de namn och knappar som
// redan står där (`taken`). I ordning:
//   1. i det egna landskapet: mitt i, eller lite upp, ner och åt sidorna,
//      och krymps det en pixel i taget ner till MIN_INSIDE_SIZE,
//   2. annars på närmaste lediga plats som inte ligger i ett annat landskap
//      (havet eller utanför gränsen), med en blyertslinje till landskapet,
//   3. som sista utväg i mitten ändå, så att alla landskap alltid har ett namn.
// `whereIs(dx, dy)` svarar vilket landskap (namn eller null) en flyttad mitt
// hamnar i. Allt räknas i pixlar relativt landskapets punkt.
const MIN_INSIDE_SIZE = 8
const MIN_NAME_SIZE = 7
const NAME_MARGIN = 2 // pixlar mellan namnen
// Flyttar i namnbredder (sidled) och radhöjder (höjdled), närmast först.
const offsetsFor = (xs, ys) =>
  xs
    .flatMap((fx) => ys.map((fy) => [fx, fy]))
    .sort((a, b) => Math.hypot(a[0] * 3, a[1]) - Math.hypot(b[0] * 3, b[1]))
const NEAR_OFFSETS = offsetsFor([0, -0.5, 0.5, -1, 1], [0, -1, 1, -2, 2, -3, 3])
const FAR_OFFSETS = offsetsFor([0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2], [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6])

function placeLandskapName(name, startSize, taken, whereIs, screen) {
  // Ledigt och helt på skärmen (`screen`, i samma relativa koordinater).
  const fits = (box) =>
    box[0] >= screen[0] &&
    box[1] >= screen[1] &&
    box[2] <= screen[2] &&
    box[3] <= screen[3] &&
    !taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])
  const boxAt = (size, fx, fy) => {
    const width = landskapNameWidth(name, size)
    const height = size * 1.25
    const dx = fx * width
    const dy = fy * height
    const halfW = width / 2 + NAME_MARGIN
    const halfH = height / 2 + NAME_MARGIN
    return { size, dx, dy, box: [dx - halfW, dy - halfH, dx + halfW, dy + halfH] }
  }
  const tryPlace = (minSize, offsets, accept) => {
    for (let size = startSize; size >= minSize; size--) {
      for (const [fx, fy] of offsets) {
        const candidate = boxAt(size, fx, fy)
        if (fits(candidate.box) && accept(whereIs(candidate.dx, candidate.dy))) return candidate
      }
    }
    return null
  }
  const inside = tryPlace(MIN_INSIDE_SIZE, NEAR_OFFSETS, (at) => at === name)
  if (inside) return { ...inside, pointer: false }
  const outside = tryPlace(MIN_NAME_SIZE, FAR_OFFSETS, (at) => at === name || at === null)
  if (outside) return { ...outside, pointer: whereIs(outside.dx, outside.dy) !== name }
  return { ...boxAt(MIN_NAME_SIZE, 0, 0), pointer: false }
}

// Klipper en ring (longitud/latitud) mot en rektangel [väst, syd, öst, nord]
// (Sutherland-Hodgman). Används så att bara gränsen nära det som syns räknas
// om till skärmen: punkter långt bort, bortom "horisonten" i lutningen, ger
// meningslösa skärmkoordinater som vänder på hålet.
function clipRing(ring, [west, south, east, north]) {
  const edges = [
    [(p) => p[0] >= west, (a, b) => [west, a[1] + ((b[1] - a[1]) * (west - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= east, (a, b) => [east, a[1] + ((b[1] - a[1]) * (east - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= south, (a, b) => [a[0] + ((b[0] - a[0]) * (south - a[1])) / (b[1] - a[1]), south]],
    [(p) => p[1] <= north, (a, b) => [a[0] + ((b[0] - a[0]) * (north - a[1])) / (b[1] - a[1]), north]],
  ]
  let points = ring
  for (const [inside, cross] of edges) {
    const out = []
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (inside(a)) {
        out.push(a)
        if (!inside(b)) out.push(cross(a, b))
      } else if (inside(b)) {
        out.push(cross(a, b))
      }
    }
    points = out
    if (!points.length) break
  }
  return points
}

// Utanför Sverige är det bara tomt papper: en kopia av blocket (med linjer
// och marginal) ovanpå kartan, med Sverige urklippt som ett hål. Hålet följer
// kartan när den flyttas. Syns ingen gräns alls (inzoomat mitt i landet)
// stängs lagret av. På landskaps- och länsnivån är hålet i stället bara det
// valda landskapet eller länet (`getFocus()` ger { landskap } eller { lan }
// med namn respektive länskod, annars null), så att resten av landet också
// blir tomt papper.
function attachOutsidePaper(map, el, getFocus) {
  function render() {
    const focus = getFocus()
    let rings = SWEDEN_RINGS
    let contains = inSweden
    if (focus?.landskap) {
      rings = landskapRings(focus.landskap)
      contains = (lng, lat) => landskapMaskAt([lng, lat]) === focus.landskap
    } else if (focus?.lan) {
      rings = lanRings(focus.lan)
      contains = (lng, lat) => lanCodeAt([lng, lat]) === focus.lan
    }
    // Kartans storlek, inte lagrets: ett dolt lager mäter 0 x 0.
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    let path = `M0 0H${width}V${height}H0Z`
    let borderOnScreen = false
    // Bara gränsen inom (en bit runt) det synliga området.
    const bounds = map.getBounds()
    const padLng = (bounds.getEast() - bounds.getWest()) * 0.25
    const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.25
    const view = [bounds.getWest() - padLng, bounds.getSouth() - padLat, bounds.getEast() + padLng, bounds.getNorth() + padLat]
    for (const fullRing of rings) {
      const ring = clipRing(fullRing, view)
      if (ring.length < 3) continue
      path += 'M'
      for (const point of ring) {
        const { x, y } = map.project(point)
        if (x >= 0 && x <= width && y >= 0 && y <= height) borderOnScreen = true
        path += `${Math.round(x)} ${Math.round(y)}L`
      }
      path = path.slice(0, -1) + 'Z'
    }
    // Ingen gränspunkt på skärmen räcker inte (gränsen kan gå rakt över
    // skärmen mellan två punkter), så hörnen och kanternas mitt kollas också.
    const edgePoints = [0, 0.5, 1].flatMap((fx) => [0, 0.5, 1].map((fy) => [fx * width, fy * height]))
    const allInside = edgePoints.every((p) => {
      const { lng, lat } = map.unproject(p)
      return contains(lng, lat)
    })
    if (!borderOnScreen && allInside) {
      el.style.display = 'none'
      return
    }
    el.style.display = ''
    el.style.clipPath = `path(evenodd, "${path}")`
  }
  map.on('move', render)
  map.on('resize', render)
  render()
  return { render }
}

// Var landskapens namn står på Sverige-nivån, placerade för hand (i
// redigeringsläget): namnets mitt relativt Sveriges ruta på skärmen, där
// [0, 0] är rutans övre vänstra hörn och [1, 1] det nedre högra. De västra
// namnen står längs norska gränsen och de östra som en lista längs
// Östersjökusten.
const LANDSKAP_LIST_LAYOUT = {
  Lappland: [0.275, 0.111],
  Jämtland: [0.202, 0.151],
  Dalarna: [0.12, 0.205],
  Härjedalen: [0.064, 0.274],
  Värmland: [0.042, 0.481],
  Dalsland: [-0.079, 0.554],
  Västergötland: [-0.01, 0.521],
  Bohuslän: [-0.084, 0.594],
  Halland: [-0.005, 0.855],
  Skåne: [-0.01, 0.894],
  Norrbotten: [0.941, 0.311],
  Västerbotten: [0.883, 0.357],
  Ångermanland: [0.826, 0.403],
  Medelpad: [0.771, 0.45],
  Hälsingland: [0.788, 0.5],
  Gästrikland: [0.854, 0.539],
  Uppland: [0.862, 0.584],
  Västmanland: [0.864, 0.624],
  Södermanland: [0.865, 0.674],
  Närke: [0.853, 0.709],
  Östergötland: [0.907, 0.739],
  Gotland: [0.839, 0.783],
  Småland: [0.882, 0.82],
  Öland: [0.773, 0.869],
  Blekinge: [0.853, 0.894],
}

// Landskapslistan på Sverige-nivån: alla namn i två kolumner bredvid landet,
// med en linje till varje landskap. Textstorlek efter skärmens bredd, och
// kolumnernas bredd (längsta namnet plus luft för linjerna), som fitSweden
// lämnar plats för på sidorna.
const LIST_GAP = 14 // pixlar mellan Sverige och listan
const LIST_BOTTOM = 96 // och slutar ovanför kompassen och källhänvisningen
// Hur stor del av listans bredd som reserveras på var sida om Sverige.
const LIST_SHARE = 0.6
const LIST_SHARE_MOBILE = 0.25
const MOBILE_WIDTH = 600
function listFontSize(screenWidth) {
  return Math.round(Math.min(13, Math.max(9, screenWidth / 36)))
}
function listColumnWidth(screenWidth) {
  const size = listFontSize(screenWidth)
  return Math.max(...LANDSKAP_LABELS.map(({ name }) => landskapNameWidth(name, size))) + LIST_GAP + 8
}

// Lägger ortnamnen som HTML-text i Caveat. Kartan räknar ut var namnen får
// plats utan att krocka (det osynliga lagret "place-anchors"); här hämtas
// de platserna och texten flyttas med när kartan rör sig. Utzoomat byts de
// mot landskapens namn, och de landskap som inte får plats (små landskap
// bredvid stora) hoppas över.
//
// På Sverige-nivån (getMode() === 'sverige') står landskapens namn i stället
// som en lista bredvid landet (se listEls). Namnen i listan går att klicka på
// (onPick) och markerar sitt landskap när man hovrar (onHover).
//
// På landskapsnivån (getLandskap() ger det valda landskapets namn) visas bara
// det landskapets namn och ortnamnen inom det.
//
// I landskapsvyn visas i stället länen i landskapet (lanEls): namnen går att
// klicka på (onPickLan) och markerar sitt län när man hovrar (onHoverLan).
//
// På länsnivån (getLan() ger länskoden) visas bara ortnamnen inom länet.
//
// I länsvyn visas kommunernas namn (getKommuner) utzoomat, klickbara
// (onPickKommun), och ortnamnen inom länet när man zoomar in.
function syncPlaceLabels(
  map,
  layer,
  { getMode, getLandskap, getLan, getKommuner, onPick, onHover, onPickLan, onHoverLan, onPickKommun },
) {
  let placed = []
  // Största landskapen först, så att de vinner när namnen krockar.
  const landskap = [...LANDSKAP_LABELS].sort((a, b) => b.km2 - a.km2)

  function placeEls(opacity) {
    if (opacity <= 0) return []
    const landskap = getLandskap()
    const lan = getLan()
    return placed
      .filter((p) => (!landskap || p.landskap === landskap) && (!lan || p.lan === lan))
      .map(({ name, lngLat, big }) => {
      const el = document.createElement('span')
      el.className = `map-sketch-label${big ? ' map-sketch-label-big' : ''}`
      el.textContent = name
      const { x, y } = map.project(lngLat)
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      if (opacity < 1) el.style.opacity = opacity
      return el
    })
  }

  // Knappar och lappar ovanpå kartan, som namnen inte ska hamna under.
  const UI_SELECTORS = [
    '.map-levels',
    '.map-profile-wrap',
    '.map-page-widgets',
    '.maplibregl-ctrl-top-right',
    '.map-sketch-tools',
  ]

  // Namnens placering räknas om bara när zoomen eller storleken ändras (det
  // tar en stund); när kartan bara flyttas följer de med sina landskap.
  let layout = null
  let layoutKey = ''

  function computeLayout(zoom) {
    // Upptagna rutor: knapparna (i lagrets koordinater) och namnen
    // allteftersom de placeras.
    const origin = layer.getBoundingClientRect()
    const root = layer.parentElement
    const ui = UI_SELECTORS.flatMap((selector) => {
      const el = root.querySelector(selector)
      if (!el || el.hidden) return []
      const r = el.getBoundingClientRect()
      if (!r.width) return []
      return [[r.left - origin.left, r.top - origin.top, r.right - origin.left, r.bottom - origin.top]]
    })
    const placed = []
    const result = new Map()
    for (const { name, lngLat, km2 } of landskap) {
      const { x, y } = map.project(lngLat)
      const taken = [...ui, ...placed].map((b) => [b[0] - x, b[1] - y, b[2] - x, b[3] - y])
      const whereIs = (dx, dy) => landskapNameAt(map.unproject([x + dx, y + dy]).toArray())
      const screen = [4 - x, 4 - y, layer.clientWidth - 4 - x, layer.clientHeight - 4 - y]
      const spot = placeLandskapName(name, landskapFontSize(km2, zoom), taken, whereIs, screen)
      placed.push([x + spot.box[0], y + spot.box[1], x + spot.box[2], y + spot.box[3]])
      result.set(name, spot)
    }
    return result
  }

  function landskapEls(zoom, opacity) {
    if (opacity <= 0) return []
    const key = `${zoom.toFixed(2)}|${layer.clientWidth}|${layer.clientHeight}`
    if (key !== layoutKey) {
      layout = computeLayout(zoom)
      layoutKey = key
    }
    const els = []
    let pointers = ''
    const selected = getLandskap()
    for (const { name, lngLat } of landskap) {
      if (selected && name !== selected) continue
      const { size, dx, dy, box, pointer } = layout.get(name)
      const { x, y } = map.project(lngLat)
      const el = document.createElement('span')
      el.className = 'map-sketch-landskap'
      el.textContent = name
      el.style.fontSize = `${size}px`
      el.style.transform = `translate(${x + dx}px, ${y + dy}px) translate(-50%, -50%)`
      if (opacity < 1) el.style.opacity = opacity
      els.push(el)
      if (pointer) {
        // Linje från landskapet till närmaste punkt på namnets kant, och en
        // liten prick i landskapet.
        const ex = Math.max(box[0] + NAME_MARGIN, Math.min(0, box[2] - NAME_MARGIN))
        const ey = Math.max(box[1] + NAME_MARGIN, Math.min(0, box[3] - NAME_MARGIN))
        pointers += `<line x1="${x}" y1="${y}" x2="${x + ex}" y2="${y + ey}"/><circle cx="${x}" cy="${y}" r="1.8"/>`
      }
    }
    if (pointers) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'map-sketch-landskap-pointers')
      svg.innerHTML = pointers
      if (opacity < 1) svg.style.opacity = opacity
      els.unshift(svg)
    }
    return els
  }

  // Landskapen som listor bredvid Sverige, på de platser som står i
  // LANDSKAP_LIST_LAYOUT (relativt Sveriges ruta, så att det fungerar på alla
  // skärmstorlekar). Namnen hålls på skärmen och utanför knapparna, och
  // knuffas isär i höjdled om de skulle krocka (på mindre skärmar, där texten
  // är större i förhållande till landet). En linje går från varje namn till
  // en prick i landskapet.
  function listEls(opacity) {
    if (opacity <= 0) return []
    const width = layer.clientWidth
    const height = layer.clientHeight
    const outline = SWEDEN_RINGS.flatMap((ring) => ring.map((point) => map.project(point)))
    const minX = Math.min(...outline.map((p) => p.x))
    const maxX = Math.max(...outline.map((p) => p.x))
    const minY = Math.min(...outline.map((p) => p.y))
    const maxY = Math.max(...outline.map((p) => p.y))
    const size = listFontSize(width)
    const rowHeight = size * 1.5
    // Knapparna uppe till höger: namn som hamnar under dem flyttas nedanför.
    const levels = layer.parentElement.querySelector('.map-levels')
    const origin = layer.getBoundingClientRect()
    const ui = levels?.getBoundingClientRect()
    const uiBox = ui && [ui.left - origin.left - 6, 0, width, ui.bottom - origin.top + 6]

    const items = LANDSKAP_LABELS.map((label) => {
      const [u, v] = LANDSKAP_LIST_LAYOUT[label.name] ?? [0.5, 0.5]
      const nameWidth = landskapNameWidth(label.name, size)
      const anchor = map.project(label.lngLat)
      let cx = minX + u * (maxX - minX)
      let cy = minY + v * (maxY - minY)
      // På skärmen, med en liten marginal.
      cx = Math.min(width - nameWidth / 2 - 4, Math.max(nameWidth / 2 + 4, cx))
      cy = Math.min(height - LIST_BOTTOM, Math.max(rowHeight / 2 + 4, cy))
      if (uiBox && cx + nameWidth / 2 > uiBox[0] && cy - rowHeight / 2 < uiBox[3]) cy = uiBox[3] + rowHeight / 2
      return { ...label, anchor, nameWidth, cx, cy }
    })

    // Knuffa isär namn som överlappar (uppifrån och ner, några varv).
    for (let pass = 0; pass < 6; pass++) {
      items.sort((a, b) => a.cy - b.cy)
      let changed = false
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i]
          const b = items[j]
          const overlapX = Math.abs(a.cx - b.cx) < (a.nameWidth + b.nameWidth) / 2
          const gap = b.cy - a.cy
          if (overlapX && gap < rowHeight) {
            const push = (rowHeight - gap) / 2
            a.cy -= push
            b.cy += push
            changed = true
          }
        }
      }
      if (!changed) break
    }

    const els = []
    let lines = ''
    for (const { id, name, anchor, nameWidth, cx, cy } of items) {
      // Knappar, så att namnen går att nå med tangentbordet.
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'map-sketch-landskap is-listed'
      el.textContent = name
      el.dataset.name = name
      el.dataset.id = id
      el.style.fontSize = `${size}px`
      el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`
      if (opacity < 1) el.style.opacity = opacity
      els.push(el)
      // Linjen slutar vid närmaste punkt på namnets kant.
      const ex = Math.max(cx - nameWidth / 2, Math.min(anchor.x, cx + nameWidth / 2))
      const ey = Math.max(cy - rowHeight / 2, Math.min(anchor.y, cy + rowHeight / 2))
      lines += `<line x1="${anchor.x}" y1="${anchor.y}" x2="${ex}" y2="${ey}"/><circle cx="${anchor.x}" cy="${anchor.y}" r="1.8"/>`
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'map-sketch-landskap-pointers')
    svg.innerHTML = lines
    if (opacity < 1) svg.style.opacity = opacity
    return [svg, ...els]
  }

  // Länen i det valda landskapet: namnet mitt i länets del av landskapet,
  // större för större delar. Namn som skulle krocka knuffas isär i höjdled,
  // och alla hålls på skärmen.
  function lanEls(zoom) {
    const landskap = getLandskap()
    const labels = LAN_LABELS.filter((l) => l.landskap === landskap)
    return areaNameEls(labels, (label) => landskapFontSize(label.km2, zoom + 1), 'is-lan')
  }

  // Kommunernas namn i länsvyn, i samma stil (mindre text).
  function kommunEls(opacity) {
    if (opacity <= 0) return []
    const els = areaNameEls(getKommuner(), () => KOMMUN_NAME_SIZE, 'is-kommun')
    if (opacity < 1) els.forEach((el) => (el.style.opacity = opacity))
    return els
  }

  // Namn på områden (län, kommuner) mitt i sina områden, med pappersbakgrund
  // och klickbara (`className` avgör vad ett klick gör). Namn som skulle krocka
  // knuffas isär i höjdled, och alla hålls på skärmen.
  function areaNameEls(labels, sizeOf, className) {
    const width = layer.clientWidth
    const height = layer.clientHeight
    const items = labels.map((label) => {
      const size = sizeOf(label)
      const nameWidth = landskapNameWidth(label.name, size)
      const { x, y } = map.project(label.lngLat)
      return { ...label, size, nameWidth, cx: x, cy: y }
    })
    for (let pass = 0; pass < 6; pass++) {
      items.sort((a, b) => a.cy - b.cy)
      let changed = false
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i]
          const b = items[j]
          const rowHeight = (a.size + b.size) * 0.75
          if (Math.abs(a.cx - b.cx) < (a.nameWidth + b.nameWidth) / 2 && b.cy - a.cy < rowHeight) {
            const push = (rowHeight - (b.cy - a.cy)) / 2
            a.cy -= push
            b.cy += push
            changed = true
          }
        }
      }
      if (!changed) break
    }
    return items.map(({ id, name, size, nameWidth, cx, cy, lngLat }) => {
      const x = Math.min(width - nameWidth / 2 - 4, Math.max(nameWidth / 2 + 4, cx))
      const y = Math.min(height - size, Math.max(size, cy))
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `map-sketch-landskap ${className}`
      el.textContent = name
      el.dataset.id = id
      el.dataset.lng = lngLat[0]
      el.dataset.lat = lngLat[1]
      el.style.fontSize = `${size}px`
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      return el
    })
  }

  // Namnen ritas om när kartan rör sig eller blir klar, så ett namn som har
  // tangentbordsfokus får tillbaka det efter omritningen.
  function render() {
    const focused = layer.contains(document.activeElement) ? document.activeElement : null
    const key = focused && `${focused.className}|${focused.textContent}`
    draw()
    if (!key) return
    const again = [...layer.children].find((el) => `${el.className}|${el.textContent}` === key)
    again?.focus({ preventScroll: true })
  }

  function draw() {
    const zoom = map.getZoom()
    if (getMode() === 'landskap' && getLandskap()) {
      layer.replaceChildren(...lanEls(zoom))
      return
    }
    // Länsvyn: kommunernas namn utzoomat, som tonar över i ortnamnen inom
    // länet (placeEls filtrerar) när man zoomar in. Inga landskapsnamn.
    if (getLan()) {
      const [from, to] = KOMMUN_FADE
      const placeOpacity = clamp01((zoom - from) / (to - from))
      layer.replaceChildren(...kommunEls(1 - placeOpacity), ...placeEls(placeOpacity))
      return
    }
    const [from, to] = LANDSKAP_FADE
    const placeOpacity = clamp01((zoom - from) / (to - from))
    const landskapNames = getMode() === 'sverige' ? listEls(1 - placeOpacity) : landskapEls(zoom, 1 - placeOpacity)
    layer.replaceChildren(...landskapNames, ...placeEls(placeOpacity))
  }

  // Länens namn i landskapsvyn: klick zoomar till länet, hovring markerar det.
  layer.addEventListener('click', (event) => {
    const item = event.target.closest('.is-lan, .is-kommun')
    if (!item) return
    const lngLat = [Number(item.dataset.lng), Number(item.dataset.lat)]
    if (item.classList.contains('is-kommun')) onPickKommun(lngLat)
    else onPickLan(lngLat)
  })
  // Fokus med tangentbordet markerar också, som hovring.
  for (const type of ['mouseover', 'focusin']) {
    layer.addEventListener(type, (event) => {
      const item = event.target.closest('.is-lan')
      onHoverLan(item ? item.dataset.id : null)
    })
  }

  // Namnen i listan: klick zoomar till landskapet, hovring markerar det.
  layer.addEventListener('click', (event) => {
    const item = event.target.closest('.is-listed')
    if (item) onPick(item.dataset.name)
  })

  for (const type of ['mouseover', 'focusin']) {
    layer.addEventListener(type, (event) => {
      const item = event.target.closest('.is-listed')
      onHover(item ? Number(item.dataset.id) : null)
    })
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
        landskap: landskapMaskAt(f.geometry.coordinates),
        lan: lanCodeAt(f.geometry.coordinates),
      }))
    render()
  }

  map.on('move', render)
  map.on('idle', refresh)
  return { render }
}

// Lugnt läge sparas i webbläsaren. Går det inte (t.ex. privat läge) visas
// kartan som vanligt.
const CALM_KEY = 'karta-lugnt-lage'

function readCalm() {
  try {
    return window.localStorage.getItem(CALM_KEY) === '1'
  } catch {
    return false
  }
}

function saveCalm(calm) {
  try {
    if (calm) window.localStorage.setItem(CALM_KEY, '1')
    else window.localStorage.removeItem(CALM_KEY)
  } catch {
    // Valet gäller då bara tills sidan laddas om.
  }
}

function MapPrototype() {
  const rootRef = useRef(null)
  const containerRef = useRef(null)
  const outsideRef = useRef(null)
  const labelsRef = useRef(null)
  const signsRef = useRef(null)
  const buildingsRef = useRef(null)
  const notesRef = useRef(null)
  const threadRef = useRef(null)
  const routeRef = useRef(null) // knapparnas funktioner (se attachPinsAndThread)
  const [route, setRoute] = useState({ placing: false, style: 'road', pinCount: 0, hint: '' })
  // Sidan som ligger som block på kartan: 'profil' (Min profil, den egna sidan med
  // Lägg till intressen), 'brev', 'personer', 'klubbar', 'events' eller null.
  const [openPage, setOpenPage] = useState(null)
  // Lugnt läge: kartan göms och bara pappret, widgetarna och blocken syns
  // (för den som vill ha en lugnare bakgrund, eller en långsam dator). Valet
  // sparas i webbläsaren.
  const [calm, setCalm] = useState(readCalm)
  const toggleCalm = () => setCalm((was) => !was)
  useEffect(() => saveCalm(calm), [calm])
  // Adressen blocket öppnas på (se MapPagePad), t.ex. '/klubbar?klubb=3'.
  const [padStart, setPadStart] = useState(null)

  // Öppnar ett block: en widget (start = widgetens sida) eller en viss sida.
  function openPad(page, start = MAP_PAGES[page] ?? null) {
    setOpenPage(page)
    setPadStart(start)
  }
  const mapRef = useRef(null)
  const labelsApiRef = useRef(null) // för att rita om namnen när nivån byts
  const outsideApiRef = useRef(null) // för att rita om papperet när nivån byts
  // Det valda landskapet på landskapsnivån (namn), annars null.
  const selectedLandskapRef = useRef(null)
  // Det valda länet på länsnivån (länskod), annars null. Gäller tills man
  // byter nivå (Kommun, Landskap, Sverige, eller zoomar ut till landskapet).
  const selectedLanRef = useRef(null)
  // Den valda kommunen på kommunnivå (kommunkod), annars null. Där, och bara
  // där, syns klubbarna och eventen.
  const selectedKommunRef = useRef(null)
  // Länsvyns data: { lan, bounds, kommuner } (se showLanFocus).
  const lanFocusRef = useRef(null)
  // Räknas upp för varje ny flygning till en ort, så att en gammal inte tar
  // över om man hinner välja en annan kommun.
  const flyTokenRef = useRef(0)
  const activitiesRef = useRef(null) // klubbarnas och eventens lappar på kartan
  const activitiesLayerRef = useRef(null)

  // Hämtar klubbar och events som syns för användaren (samma som listorna i
  // appen) och lägger dem på kartan.
  async function loadActivities() {
    try {
      const [publicGroups, myGroups, events, kommuner] = await Promise.all([
        getGroups(),
        getMyGroups(),
        getEvents(),
        allKommuner(),
      ])
      const groups = [...new Map([...publicGroups, ...myGroups].map((g) => [g.id, g])).values()]
      activitiesRef.current?.setItems(activitiesFrom({ groups, events, kommuner }))
    } catch {
      // Kartan fungerar utan lapparna.
    }
  }

  // Klick på en lapp: öppna klubben eller eventet i sitt block.
  function openActivity(item) {
    // Klubbar och Events läser ?klubb= och ?event= när de öppnas.
    if (item.type === 'klubb') openPad('klubbar', `/klubbar?klubb=${item.id}`)
    else openPad('events', `/events?event=${item.id}`)
  }
  const openActivityRef = useRef(openActivity)
  openActivityRef.current = openActivity

  // "Visa på kartan" från Klubbar och Events: stäng blocket, gå till länet
  // där klubben eller eventet finns och flyg till lappen, som markeras.
  const mapActions = {
    hasLocation: (type, id) => Boolean(activitiesRef.current?.getItem(type, id)),
    showOnMap(type, id) {
      const item = activitiesRef.current?.getItem(type, id)
      const map = mapRef.current
      if (!item || !map) return
      setOpenPage(null)
      setMode('free', null, item.lan, item.kommun)
      map.easeTo({ center: item.lngLat, zoom: ACTIVITY_ZOOM, duration: 1400 })
      setLevelName(item.name)
      map.once('moveend', () => activitiesRef.current?.highlight(`${type}:${id}`))
    },
  }

  // När ett block stängs kan en klubb eller ett event ha skapats eller
  // ändrats, så hämta lapparna igen.
  useEffect(() => {
    if (openPage === null && activitiesRef.current) loadActivities()
  }, [openPage])
  const fitRef = useRef(null) // mitt och zoom för hela Sverige (se fitSweden)
  // Namnet på området man senast zoomade till med nivåknapparna.
  const [levelName, setLevelName] = useState('')
  // Kartans nivå: 'sverige', 'landskap' eller 'free' (se LEVEL_PADDING ovan).
  const [mode, setModeState] = useState('free')
  const modeRef = useRef('free')
  const pinsShown = mode === 'free'

  // Byt nivå: lås eller släpp zoomen med mus, fingrar och tangentbord.
  // `lan`: länskoden på fri nivå (länsvyn och kommuner i den), annars null.
  function setMode(next, landskap = null, lan = null, kommun = null) {
    modeRef.current = next
    setModeState(next)
    selectedLandskapRef.current = next === 'landskap' ? landskap : null
    selectedLanRef.current = next === 'free' ? lan : null
    selectedKommunRef.current = next === 'free' ? kommun : null
    showLanFocus(selectedLanRef.current)
    // En väntande flygning till en ort gäller inte längre.
    flyTokenRef.current += 1
    const map = mapRef.current
    if (!map) return
    const locked = next !== 'free'
    for (const handler of [map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard]) {
      if (locked) handler.disable()
      else handler.enable()
    }
    // enable() slår på vridning igen, och kartan ska aldrig vridas.
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    // Nålarna finns bara på fri nivå.
    if (locked) routeRef.current?.setPlacing(false)
    // Landskapsnamnen ritas olika på Sverige-nivån (som lista), och papperet
    // täcker allt utom det valda landskapet på landskapsnivån, så rita om.
    labelsApiRef.current?.render()
    outsideApiRef.current?.render()
    activitiesRef.current?.render()
    const hidden = next === 'sverige' ? HIDDEN_ON_SWEDEN : next === 'landskap' ? HIDDEN_ON_LANDSKAP : []
    const shown = next === 'landskap' ? SHOWN_ON_LANDSKAP : []
    for (const layer of [...HIDDEN_ON_LANDSKAP, ...SHOWN_ON_LANDSKAP]) {
      if (!map.getLayer(layer)) continue
      const visible = shown.includes(layer) || (!hidden.includes(layer) && !SHOWN_ON_LANDSKAP.includes(layer))
      map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
    }
  }

  // Länsvyn: kommungränserna och kommunnamnen i länet, och länets utbredning
  // (för att veta när man har zoomat ut förbi länet). Laddas när den behövs.
  async function showLanFocus(lan) {
    const map = mapRef.current
    if (!map) return
    if (!lan) {
      lanFocusRef.current = null
      if (map.getLayer('kommun-borders')) map.setLayoutProperty('kommun-borders', 'visibility', 'none')
      return
    }
    if (lanFocusRef.current?.lan === lan) return
    const [region, kommuner] = await Promise.all([lanByCode(lan), kommunerInLan(lan)])
    if (selectedLanRef.current !== lan || mapRef.current !== map) return
    // Vid start kan datan komma innan kartans stil har laddats.
    if (!map.getSource('kommuner')) await new Promise((resolve) => map.once('load', resolve))
    if (selectedLanRef.current !== lan || mapRef.current !== map) return
    lanFocusRef.current = { lan, bounds: region?.bounds, kommuner: kommuner.labels }
    map.getSource('kommuner')?.setData(kommuner.geojson)
    if (map.getLayer('kommun-borders')) map.setLayoutProperty('kommun-borders', 'visibility', 'visible')
    labelsApiRef.current?.render()
  }

  // Zooma så att hela området syns, och visa dess namn.
  function zoomToRegion({ name, bounds }) {
    const map = mapRef.current
    const camera = map?.cameraForBounds(bounds, { padding: LEVEL_PADDING, pitch: TILT })
    if (camera) map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 900 })
    setLevelName(name)
  }
  const zoomToRegionRef = useRef(zoomToRegion)
  zoomToRegionRef.current = zoomToRegion

  // Zooma så att hela området (landskapet, länet eller kommunen där
  // skärmens mitt är, eller hela Sverige) syns.
  async function zoomToLevel(level, lngLat) {
    const map = mapRef.current
    if (!map) return
    if (level === 'sverige') {
      setMode('sverige')
      const fit = fitRef.current
      if (fit) map.easeTo({ center: fit.center, zoom: fit.zoom, duration: 900 })
      setLevelName('Sverige')
      return
    }
    const region = await regionAt(level, lngLat ?? map.getCenter().toArray())
    if (level === 'landskap') {
      enterLandskap(region)
      return
    }
    // Länsnivån och kommuner i den: bara länet syns (resten blir tomt papper),
    // och man kan röra sig fritt inom det.
    setMode('free', null, region.lan, level === 'kommun' ? region.kod : null)
    zoomToRegion(region)
    if (level === 'kommun') flyToPlaceIn(map, region)
  }

  // Från översikten av en kommun ner till husnivå: till stadsdelen om den
  // finns och hittas, annars till centralorten (en stad eller tätort med
  // kommunens namn, annars den största i kommunen), annars till kommunens
  // mittpunkt. Ortnamnen finns först när kartrutorna har laddats, så det
  // görs när översikten är klar.
  function flyToPlaceIn(map, kommun, district = null) {
    const token = (flyTokenRef.current += 1)
    map.once('idle', () => {
      if (mapRef.current !== map || flyTokenRef.current !== token) return
      const places = map
        .querySourceFeatures('openmaptiles', { sourceLayer: 'place' })
        .filter((f) => f.properties.name && kommun.geometry && isInside(kommun.geometry, f.geometry.coordinates))
      const name = (f) => normalizePlace(f.properties['name:sv'] ?? f.properties.name)
      let match = null
      if (district) {
        const candidates = places.filter((f) => DISTRICT_CLASSES.includes(f.properties.class))
        // Helst exakt samma namn, annars ett namn som börjar med texten (eller
        // tvärtom, t.ex. "Gustavsberg centrum" -> Gustavsberg).
        match =
          candidates.find((f) => name(f) === district) ??
          candidates.find((f) => name(f).startsWith(district) || district.startsWith(name(f)))
      }
      if (!match) {
        const kommunName = normalizePlace(kommun.name.replace(/ kommun$/, ''))
        const towns = places.filter((f) => TOWN_CLASSES.includes(f.properties.class))
        match =
          towns.find((f) => name(f) === kommunName) ??
          towns.find((f) => f.properties.class === 'city') ??
          towns.sort((a, b) => (a.properties.rank ?? 99) - (b.properties.rank ?? 99))[0] ??
          null
      }
      const center = match?.geometry.coordinates ?? kommun.label
      if (!center) return
      map.easeTo({ center, zoom: DISTRICT_ZOOM, duration: 1600 })
      if (match) setLevelName(`${match.properties['name:sv'] ?? match.properties.name}, ${kommun.name}`)
    })
  }

  // Landskapsnivån för ett landskap: lås zoomen, visa bara det landskapet och
  // zooma dit.
  function enterLandskap(region) {
    setMode('landskap', region.name)
    zoomToRegion(region)
  }
  const enterLandskapRef = useRef(enterLandskap)
  enterLandskapRef.current = enterLandskap

  // Ett steg in (Sverige → landskap → län) eller ut, vid en punkt.
  function stepLevel(direction, lngLat) {
    const order = ['sverige', 'landskap', 'lan']
    const current = modeRef.current === 'free' ? 2 : order.indexOf(modeRef.current)
    const next = Math.max(0, Math.min(order.length - 1, current + direction))
    if (next !== current) zoomToLevel(order[next], lngLat)
  }
  // Kartan börjar där användaren bor enligt profilen: först kommunen (en kod
  // från en fast lista, så den hittas alltid), sedan stadsdelen (fritext) om
  // ett ortnamn i kartans egen data inom kommunen stämmer med den. Hittas
  // ingen stadsdel blir kartan kvar på kommunen. Ingen profil eller kommun:
  // kartan börjar där den gör nu.
  async function startAtHome(map) {
    let profile
    try {
      profile = await getProfile()
    } catch {
      return
    }
    const kommun = profile?.municipality_code && (await kommunByCode(profile.municipality_code))
    if (!kommun || mapRef.current !== map) return
    setMode('free', null, kommun.lan, kommun.kod)
    const camera = map.cameraForBounds(kommun.bounds, { padding: LEVEL_PADDING, pitch: TILT })
    if (camera) map.jumpTo({ center: camera.center, zoom: camera.zoom })
    setLevelName(kommun.name)
    flyToPlaceIn(map, kommun, profile.district ? normalizePlace(profile.district) : null)
  }

  const zoomToLevelRef = useRef(zoomToLevel)
  zoomToLevelRef.current = zoomToLevel
  const stepLevelRef = useRef(stepLevel)
  stepLevelRef.current = stepLevel

  useEffect(() => {
    // Mitt och zoom där hela Sverige ryms på skärmen, i kartans lutning.
    // Räknas om när fönstret ändrar storlek.
    let fit = null
    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: GUSTAVSBERG,
      zoom: 13.5,
      maxZoom: MAX_ZOOM,
      transformConstrain: (lngLat, zoom) => constrainToSweden(fit, lngLat, zoom, selectedLanRef.current),
      pitch: TILT,
      minPitch: TILT,
      maxPitch: TILT,
      // Ingen vridning eller ändrad lutning med musen/fingrarna.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    })
    // MapLibre passar in rektangeln runt Sverige, men i lutningen hamnar
    // landet då för lågt (mer luft ovanför än under). Därför justeras mitten
    // och zoomen några varv så att de yttersta punkterna hamnar jämnt runt
    // skärmens mitt. Kameran flyttas tillfälligt och sätts sedan tillbaka.
    function fitSweden() {
      const camera = map.cameraForBounds(SWEDEN_BOUNDS, { padding: FIT_PADDING, pitch: TILT })
      if (!camera) return
      const saved = { center: map.getCenter(), zoom: map.getZoom() }
      fit = null // ingen begränsning medan vi mäter
      map.setMinZoom(0)
      let center = LngLat.convert(camera.center)
      let zoom = camera.zoom
      const { clientWidth: width, clientHeight: height } = map.getCanvas()
      for (let i = 0; i < 3; i++) {
        map.jumpTo({ center, zoom })
        const points = SWEDEN_EXTREMES.map((p) => map.project(p))
        const xs = points.map((p) => p.x)
        const ys = points.map((p) => p.y)
        const midX = (Math.min(...xs) + Math.max(...xs)) / 2
        const midY = (Math.min(...ys) + Math.max(...ys)) / 2
        center = map.unproject([midX, midY])
        const spanX = Math.max(...xs) - Math.min(...xs)
        const spanY = Math.max(...ys) - Math.min(...ys)
        // Plats på sidorna för landskapslistan. Namnen kan stå närmare
        // landet där det är smalt (Sverige är snett), så det räcker med en
        // del av kolumnens bredd, och på smala skärmar (mobil) en ännu mindre
        // del, så att Sverige inte blir för litet.
        const listShare = width < MOBILE_WIDTH ? LIST_SHARE_MOBILE : LIST_SHARE
        const padX = Math.max(FIT_PADDING, listColumnWidth(width) * listShare)
        const scale = Math.min((width - 2 * padX) / spanX, (height - 2 * FIT_PADDING) / spanY)
        zoom += Math.log2(scale)
      }
      fit = { center, zoom }
      fitRef.current = fit
      map.setMinZoom(zoom)
      map.jumpTo(saved)
    }
    fitSweden()
    map.on('resize', fitSweden)
    // Helt utzoomat: glid till landets mitt när man har slutat röra kartan,
    // så att hela Sverige ligger mitt på skärmen.
    map.on('moveend', () => {
      if (!fit || map.getZoom() > fit.zoom + SETTLE_ZOOMS) return
      const center = map.getCenter()
      if (Math.abs(center.lng - fit.center.lng) + Math.abs(center.lat - fit.center.lat) < 0.01) return
      map.easeTo({ center: fit.center, zoom: fit.zoom, duration: 500 })
    })
    mapRef.current = map
    // Klick på kartan på en låst nivå: ett steg in, där man klickade.
    map.on('click', (event) => {
      if (modeRef.current !== 'free') stepLevelRef.current(1, event.lngLat.toArray())
    })
    // + och − stegar mellan nivåerna när zoomen är låst (fångas innan
    // MapLibres egna knappar hinner zooma).
    function onZoomButton(event) {
      if (modeRef.current === 'free') return // fri nivå: vanlig zoom
      const button = event.target.closest('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out')
      if (!button) return
      event.stopPropagation()
      stepLevelRef.current(button.matches('.maplibregl-ctrl-zoom-in') ? 1 : -1, map.getCenter().toArray())
    }
    rootRef.current.addEventListener('click', onZoomButton, true)
    // Zoomar man själv ut förbi landskapets storlek fastnar kartan på
    // landskapet vid skärmens mitt.
    map.on('zoomend', (event) => {
      if (modeRef.current !== 'free' || !event.originalEvent) return
      const region = landskapAt(map.getCenter().toArray())
      // I länsvyn: förbi länets storlek går man upp till landskapet.
      const lanBounds = lanFocusRef.current?.bounds
      if (lanBounds) {
        const lan = map.cameraForBounds(lanBounds, { padding: LEVEL_PADDING, pitch: TILT })
        if (lan && map.getZoom() < lan.zoom - 0.3) enterLandskapRef.current(region)
        return
      }
      const landskap = map.cameraForBounds(region.bounds, { padding: LEVEL_PADDING, pitch: TILT })
      if (landskap && map.getZoom() < landskap.zoom) enterLandskapRef.current(region)
    })
    // På Sverige-nivån markeras landskapet under musen, som man kan klicka på
    // (se landskap-fill i mapPrototypeStyle.js).
    let hovered = null
    function setHovered(id) {
      if (hovered === id) return
      if (hovered !== null) map.setFeatureState({ source: 'landskap-areas', id: hovered }, { hover: false })
      hovered = id
      if (id !== null) map.setFeatureState({ source: 'landskap-areas', id }, { hover: true })
    }
    map.on('mousemove', 'landskap-fill', (event) => {
      setHovered(modeRef.current === 'sverige' ? (event.features[0]?.id ?? null) : null)
    })
    map.on('mouseleave', 'landskap-fill', () => setHovered(null))
    map.on('zoomstart', () => setHovered(null))
    // I landskapsvyn markeras länet under musen (klick tar en till länet).
    let hoveredLan = null
    function setHoveredLan(id) {
      if (hoveredLan === id) return
      if (hoveredLan !== null) map.setFeatureState({ source: 'lan-areas', id: hoveredLan }, { hover: false })
      hoveredLan = id
      if (id !== null) map.setFeatureState({ source: 'lan-areas', id }, { hover: true })
    }
    map.on('mousemove', 'lan-fill', (event) => {
      setHoveredLan(modeRef.current === 'landskap' ? (event.features[0]?.id ?? null) : null)
    })
    map.on('mouseleave', 'lan-fill', () => setHoveredLan(null))
    map.on('zoomstart', () => setHoveredLan(null))
    // Namnet från nivåknapparna gäller tills man drar kartan själv.
    map.on('dragstart', () => setLevelName(''))
    // Drar eller zoomar man själv innan flygningen till en ort har börjat
    // ska den inte ta över.
    map.on('dragstart', () => (flyTokenRef.current += 1))
    map.on('zoomstart', (event) => event.originalEvent && (flyTokenRef.current += 1))
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.on('styleimagemissing', (e) => addMissingDoodle(map, e.id))
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    outsideApiRef.current = attachOutsidePaper(map, outsideRef.current, () =>
      selectedLandskapRef.current
        ? { landskap: selectedLandskapRef.current }
        : selectedLanRef.current
          ? { lan: selectedLanRef.current }
          : null,
    )
    attachSketchedBuildings(map, buildingsRef.current)
    const labelsApi = syncPlaceLabels(map, labelsRef.current, {
      getMode: () => modeRef.current,
      getLandskap: () => selectedLandskapRef.current,
      getLan: () => selectedLanRef.current,
      onPick: (name) => {
        const label = LANDSKAP_LABELS.find((l) => l.name === name)
        enterLandskapRef.current(landskapAt(label.lngLat))
      },
      onHover: (id) => setHovered(id),
      onPickLan: (lngLat) => zoomToLevelRef.current('lan', lngLat),
      getKommuner: () => lanFocusRef.current?.kommuner ?? [],
      onPickKommun: (lngLat) => zoomToLevelRef.current('kommun', lngLat),
      onHoverLan: (id) => setHoveredLan(id),
    })
    startAtHome(map)
    activitiesRef.current = attachActivityMarkers(map, activitiesLayerRef.current, {
      getKommun: () => selectedKommunRef.current,
      onPick: (item) => openActivityRef.current(item),
    })
    loadActivities()
    labelsApiRef.current = labelsApi
    // Mätt innan Caveat hann laddas blir listans bredd fel: räkna om då.
    document.fonts?.ready.then(() => mapRef.current === map && fitSweden())
    attachPlaceNotes(map, 'places', notesRef.current)
    // Efter lapparna, så att hovringen redan är markerad när skyltarna ritas om.
    attachPlaceSigns(map, 'places', signsRef.current)
    routeRef.current = attachPinsAndThread(map, threadRef.current, setRoute)
    const labels = labelsRef.current
    const signs = signsRef.current
    const notes = notesRef.current
    const thread = threadRef.current

    // Scroll och nyp (som webbläsaren skickar som Ctrl + scroll) över något
    // som ligger ovanpå kartan - en lapp, en nål, en knapp - skulle annars
    // zooma hela sidan i stället för kartan. Skicka dem vidare till kartan.
    const root = rootRef.current
    const mapArea = map.getCanvasContainer()
    function forwardWheel(event) {
      if (mapArea.contains(event.target)) return // kartan sköter det själv
      if (event.target.closest('.map-pad')) return // blocket scrollar själv
      event.preventDefault()
      mapArea.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    root.addEventListener('wheel', forwardWheel, { passive: false })

    return () => {
      root.removeEventListener('wheel', forwardWheel)
      root.removeEventListener('click', onZoomButton, true)
      mapRef.current = null
      labelsApiRef.current = null
      outsideApiRef.current = null
      map.remove()
      // Lappar, namn och nålar ligger utanför kartan, så de tas bort för sig.
      labels.replaceChildren()
      signs.replaceChildren()
      notes.replaceChildren()
      thread.replaceChildren()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={`map-sketch${mode !== 'free' ? ' is-level-locked' : ''}${openPage ? ' has-pad' : ''}${calm ? ' is-calm' : ''}`}
      style={{ '--map-tilt': `${TILT}deg` }}
    >
      {/* Blockets linjer, lutade på samma sätt som kartan. */}
      <div className="map-sketch-paper" aria-hidden="true" />
      <div ref={containerRef} className="map-sketch-canvas" />
      <div ref={outsideRef} className="map-sketch-outside" aria-hidden="true">
        <div className="map-sketch-paper" />
      </div>
      <canvas ref={buildingsRef} className="map-sketch-buildings" aria-hidden="true" />
      <div ref={signsRef} className="map-sketch-signs" aria-hidden="true" />
      <div ref={labelsRef} className="map-sketch-labels" aria-hidden="true" />
      <div ref={activitiesLayerRef} className="map-sketch-activities" />
      <div ref={notesRef} className="map-sketch-notes" />
      <div ref={threadRef} className="map-sketch-thread" hidden={!pinsShown} />
      <svg className="map-sketch-compass" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="44" r="24" />
        <path d="M40 22 L46 44 L40 66 L34 44 Z" />
        <path className="map-sketch-compass-north" d="M40 22 L46 44 L34 44 Z" />
        <text x="40" y="14">N</text>
      </svg>
      <div className="map-levels" role="group" aria-label="Zooma till">
        {ZOOM_LEVELS.map(({ id, label }) => (
          <button key={id} type="button" className="map-tool" onClick={() => zoomToLevel(id)}>
            {label}
          </button>
        ))}
        {levelName && <p className="map-level-name">{levelName}</p>}
      </div>
      <div className="map-sketch-tools" role="toolbar" aria-label="Nålar och väg" hidden={!pinsShown}>
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
      <div className="map-top-widgets">
        <MapPageWidgets openPage={openPage} onOpen={(page) => (page ? openPad(page) : setOpenPage(null))} />
        <MapProfileWidget onOpen={openPad} calm={calm} onToggleCalm={toggleCalm} />
      </div>
      {calm && (
        <MapCalmPage
          onOpen={openPad}
          onOpenEvent={(id) => openActivityRef.current({ type: 'event', id })}
          onShowMap={toggleCalm}
        />
      )}
      {pinsShown && route.hint && <p className="map-sketch-hint">{route.hint}</p>}
      <div className="map-sketch-table" aria-hidden="true" />
      {openPage && padStart && (
        // key: byter man sida landar ett nytt block.
        <MapPagePad
          key={`${openPage} ${padStart}`}
          start={padStart}
          onClose={() => setOpenPage(null)}
          mapActions={mapActions}
        />
      )}
    </div>
  )
}

export default MapPrototype
