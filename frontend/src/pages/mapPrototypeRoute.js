// PROTOTYP: kartnålar och en tråd mellan dem som visar vägen.
//   - Knappen "Sätt ut nålar" slår på nålläget. Då sätter ett klick på
//     kartan först en startnål (gul), sedan en målnål (röd); fler klick
//     flyttar målnålen. Utan nålläget kan man klicka runt på kartan som vanligt.
//   - Vägen räknas ut längs gångvägar, och en papperslapp vid målet visar tid
//     och avstånd. Trådens stil väljs med knappar:
//       "Längs vägen": tråden ligger på pappret och följer vägen.
//       "Nålar i svängar": en mindre nål i varje sväng, och tråden spänns rakt
//       från nål till nål ovanför kartan, lindad runt nålarna strax under
//       huvudet, med en skugga på pappret.
//   - Dra start- eller målnålen för att flytta den, klicka på den för att ta
//     bort den.
//
// Nålar och tråd ritas i ett SVG-lager ovanpå kartan (och ovanpå post-it-
// lapparna) och räknas om när kartan rör sig. Nålarna ser ritade ut: platta
// färger, bläckkontur som är dragen två gånger (som i loggan) och hårda
// skuggor utan suddighet. Skuggorna faller åt höger och lite nedåt.
//
// Vägen räknas ut av FOSSGIS öppna OSRM-server (samma data som kartan). Den
// är gratis men till för test och låg trafik - i en riktig version ska
// backend fråga en tjänst med egen nyckel (t.ex. OpenRouteService) i stället.
// Går det inte att räkna ut en väg spänns tråden rakt mellan nålarna.

const ROUTE_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
const SVG_NS = 'http://www.w3.org/2000/svg'

// Hur rak en sträcka ska vara för att inte behöva en egen nål: avvikelser
// mindre än så här många meter från en rak tråd räknas inte som en sväng.
const BEND_TOLERANCE_M = 25

// Nålarnas mått i pixlar (vid skärmens mitt; längre bort blir de mindre).
const NEEDLE = 36 // nålens längd
const HEAD = { end: 11, bend: 8 } // huvudets radie
const LEAN = 0.12 // hur mycket nålen lutar åt vänster (andel av längden)
const SHADOW = { x: 0.62, y: 0.2 } // skuggans riktning per pixel höjd
const THREAD_AT = 0.8 // tråden lindas så här långt upp på nålen

// Färgerna från stilguiden: accent (gul) för start, error (röd) för mål.
const COLORS = { start: '#f4c430', goal: '#a32d2d', bend: '#ffffff' }
const INK = '#3a2f25'
const SHADOW_COLOR = 'rgba(58, 47, 37, 0.25)'

// --- Väg och avstånd ---

async function fetchRoute(from, to) {
  const url = `${ROUTE_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Vägtjänsten svarade ${response.status}`)
  const data = await response.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('Ingen väg hittades')
  return { coordinates: route.geometry.coordinates, meters: route.distance, seconds: route.duration }
}

// Avstånd fågelvägen i meter, om ingen väg kunde räknas ut.
function straightDistance(from, to) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
}

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

// Plockar ut vägens svängar (Ramer–Douglas–Peucker): punkter där vägen
// viker av mer än BEND_TOLERANCE_M från en rak linje. Räknas i meter kring
// vägens första punkt.
function bends(coordinates) {
  if (coordinates.length < 3) return []
  const [lng0, lat0] = coordinates[0]
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 111320
  const points = coordinates.map(([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * ky])

  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    const [ax, ay] = points[first]
    const [bx, by] = points[last]
    const length = Math.hypot(bx - ax, by - ay) || 1
    let farthest = -1
    let farthestDistance = 0
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]
      const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
      if (distance > farthestDistance) {
        farthest = i
        farthestDistance = distance
      }
    }
    if (farthestDistance > BEND_TOLERANCE_M) {
      keep[farthest] = true
      stack.push([first, farthest], [farthest, last])
    }
  }
  return coordinates.filter((_, i) => keep[i] && i !== 0 && i !== coordinates.length - 1)
}

// --- SVG-ritning ---

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  return node
}

// Var på skärmen en nål står: fot, punkt där tråden lindas, huvud och
// skuggornas ändar. `scale` gör nålar längre bort lite mindre.
function pinGeometry(base, scale, kind) {
  const length = NEEDLE * scale
  const top = { x: base.x - LEAN * length, y: base.y - length }
  const at = (t) => ({ x: base.x + (top.x - base.x) * t, y: base.y + (top.y - base.y) * t })
  const shadowOf = (height) => ({ x: base.x + SHADOW.x * height, y: base.y + SHADOW.y * height })
  return {
    base,
    top,
    thread: at(THREAD_AT),
    threadShadow: shadowOf(length * THREAD_AT),
    headShadow: shadowOf(length),
    radius: (kind === 'bend' ? HEAD.bend : HEAD.end) * scale,
    scale,
    kind,
  }
}

function drawPinShadow(group, pin) {
  group.append(
    svg('line', {
      x1: pin.base.x,
      y1: pin.base.y,
      x2: pin.headShadow.x,
      y2: pin.headShadow.y,
      stroke: SHADOW_COLOR,
      'stroke-width': 2 * pin.scale,
      'stroke-linecap': 'round',
    }),
    svg('ellipse', {
      cx: pin.headShadow.x + pin.radius * 0.6,
      cy: pin.headShadow.y,
      rx: pin.radius * 1.1,
      ry: pin.radius * 0.6,
      fill: SHADOW_COLOR,
    }),
  )
}

// En knappnål ritad med bläck: nålen, ett runt huvud i platt färg och en
// andra, lite förskjuten kontur, som när man drar pennan två gånger.
function drawPin(group, pin) {
  const head = { x: pin.top.x, y: pin.top.y - pin.radius * 0.55 }
  const r = pin.radius
  group.append(
    // Hålet där nålen går in i pappret.
    svg('ellipse', { cx: pin.base.x, cy: pin.base.y, rx: 1.6 * pin.scale, ry: 0.8 * pin.scale, fill: INK }),
    svg('line', {
      x1: pin.base.x,
      y1: pin.base.y,
      x2: pin.top.x,
      y2: pin.top.y,
      stroke: INK,
      'stroke-width': 1.8 * pin.scale,
      'stroke-linecap': 'round',
    }),
    svg('circle', { cx: head.x, cy: head.y, r, fill: COLORS[pin.kind], stroke: INK, 'stroke-width': 1.6 }),
    // Den andra konturen: nästan ett varv, lite förskjutet.
    svg('path', {
      d: `M ${head.x - r + 1} ${head.y - 1} A ${r} ${r - 0.8} 0 1 1 ${head.x + r * 0.3} ${head.y + r - 0.4}`,
      fill: 'none',
      stroke: INK,
      'stroke-width': 0.9,
      'stroke-linecap': 'round',
    }),
    // Ett litet blänk, ritat som ett pennstreck.
    svg('path', {
      d: `M ${head.x - r * 0.5} ${head.y - r * 0.15} q ${r * 0.1} ${-r * 0.35} ${r * 0.45} ${-r * 0.45}`,
      fill: 'none',
      stroke: INK,
      'stroke-width': 1.1,
      'stroke-linecap': 'round',
    }),
  )
}

// Tråden genom skärmpunkterna `points`: ett rött streck med bläckkant, och
// skuggan genom `shadowPoints` på pappret.
function drawThread(shadows, threads, points, shadowPoints) {
  if (points.length < 2) return
  const line = (list) => list.map((p) => `${p.x},${p.y}`).join(' ')
  shadows.append(
    svg('polyline', {
      points: line(shadowPoints),
      fill: 'none',
      stroke: SHADOW_COLOR,
      'stroke-width': 2.4,
      'stroke-linejoin': 'round',
    }),
  )
  const threadLine = line(points)
  const round = { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }
  threads.append(
    svg('polyline', { points: threadLine, ...round, stroke: INK, 'stroke-width': 3.6 }),
    svg('polyline', { points: threadLine, ...round, stroke: COLORS.goal, 'stroke-width': 1.8 }),
  )
}

// --- Kopplingen till kartan ---

// Kopplar nålar och tråd till kartan. `layer` är elementet de ritas i och
// `onChange` får läget ({ placing, style, pinCount, hint }) när något ändras,
// så att knapparna och tipset kan visas. Returnerar funktioner för knapparna.
export function attachPinsAndThread(map, layer, onChange) {
  const ends = { start: null, goal: null } // [lng, lat] för start och mål
  let path = null // hela vägen från start till mål, [lng, lat]
  let tagText = null
  let request = 0 // så att ett gammalt svar inte skriver över ett nyare
  let dragging = null // 'start' eller 'goal' medan man drar
  let placing = false // nålläget: klick på kartan sätter nålar
  let style = 'road' // 'road' = längs vägen, 'pins' = nålar i svängar

  const root = svg('svg', { class: 'map-thread-svg' })
  const shadows = svg('g')
  const threads = svg('g')
  const pinsGroup = svg('g')
  root.append(shadows, threads, pinsGroup)
  const tag = document.createElement('div')
  tag.className = 'map-pin-tag'
  layer.replaceChildren(root, tag)

  function report() {
    const pinCount = (ends.start ? 1 : 0) + (ends.goal ? 1 : 0)
    let hint
    if (!placing && pinCount === 0) hint = 'Tryck på "Sätt ut nålar" för att se vägen mellan två platser.'
    else if (!placing) hint = 'Dra nålarna för att ändra vägen. Klicka på en nål för att ta bort den.'
    else if (!ends.start) hint = 'Klicka på kartan där du börjar.'
    else if (!ends.goal) hint = 'Klicka där du vill hamna.'
    else hint = 'Klicka för att flytta målet, eller dra nålarna.'
    onChange({ placing, style, pinCount, hint })
  }

  // Hur stor en nål ska vara där den står: lika stor som marken där är
  // jämfört med skärmens mitt, inom rimliga gränser.
  function scaleAt(lngLat) {
    const meterEast = (p) => [p[0] + 1 / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1]]
    const pixels = (p) => {
      const a = map.project(p)
      const b = map.project(meterEast(p))
      return Math.hypot(b.x - a.x, b.y - a.y)
    }
    const center = map.getCenter().toArray()
    return Math.min(1.35, Math.max(0.6, pixels(lngLat) / pixels(center)))
  }

  // Vägen som tråden ska följa: hela vägen när den är uträknad, annars rakt.
  function currentPath() {
    if (!ends.start || !ends.goal) return null
    return path ?? [ends.start, ends.goal]
  }

  function render() {
    shadows.replaceChildren()
    threads.replaceChildren()
    pinsGroup.replaceChildren()
    const line = currentPath()

    const points = []
    if (ends.start) points.push({ lngLat: ends.start, kind: 'start' })
    if (style === 'pins' && line) for (const bend of bends(line)) points.push({ lngLat: bend, kind: 'bend' })
    if (ends.goal) points.push({ lngLat: ends.goal, kind: 'goal' })
    const pins = points.map(({ lngLat, kind }) => pinGeometry(map.project(lngLat), scaleAt(lngLat), kind))

    for (const pin of pins) drawPinShadow(shadows, pin)
    if (style === 'pins') {
      // Spänd från nål till nål, lindad runt nålarna, med skuggan längre bort.
      drawThread(shadows, threads, pins.map((p) => p.thread), pins.map((p) => p.threadShadow))
    } else if (line) {
      // Liggande på pappret längs vägen, med skuggan tätt intill.
      const points = line.map((lngLat) => map.project(lngLat))
      drawThread(shadows, threads, points, points.map((p) => ({ x: p.x + 1.5, y: p.y + 2 })))
    }
    // Nålar längre bort först, så att närmare nålar hamnar framför.
    for (const pin of [...pins].sort((a, b) => a.base.y - b.base.y)) {
      const group = svg('g', { class: `map-pin map-pin-${pin.kind}` })
      drawPin(group, pin)
      if (pin.kind !== 'bend') {
        group.dataset.kind = pin.kind
        group.setAttribute('role', 'button')
        group.setAttribute('aria-label', pin.kind === 'start' ? 'Startnål' : 'Målnål')
      }
      pinsGroup.append(group)
    }

    const goal = pins.find((p) => p.kind === 'goal')
    tag.hidden = !(goal && tagText)
    if (goal && tagText) {
      tag.textContent = tagText
      tag.style.transform = `translate(${goal.top.x + goal.radius + 6}px, ${goal.top.y - goal.radius * 2}px)`
    }
  }

  async function update() {
    report()
    path = null
    if (!ends.start || !ends.goal) {
      tagText = null
      render()
      return
    }
    tagText = 'Räknar ut vägen...'
    render()
    const from = { lng: ends.start[0], lat: ends.start[1] }
    const to = { lng: ends.goal[0], lat: ends.goal[1] }
    const current = ++request
    try {
      const result = await fetchRoute(from, to)
      if (current !== request) return
      // Från startnålen, längs vägen, till målnålen.
      path = [ends.start, ...result.coordinates, ends.goal]
      tagText = `${formatDuration(result.seconds)} promenad · ${formatDistance(result.meters)}`
    } catch {
      if (current !== request) return
      tagText = `Ingen väg hittades · ${formatDistance(straightDistance(from, to))} fågelvägen`
    }
    render()
  }

  // Dra start- och målnålen. Ett klick utan att dra tar bort nålen.
  layer.addEventListener('pointerdown', (event) => {
    const kind = event.target.closest('.map-pin')?.dataset.kind
    if (!kind) return
    event.preventDefault()
    event.stopPropagation()
    dragging = kind
    let moved = false
    const box = map.getCanvas().getBoundingClientRect()
    map.dragPan.disable()

    function onMove(e) {
      moved = true
      ends[kind] = map.unproject([e.clientX - box.left, e.clientY - box.top]).toArray()
      path = null
      tagText = null
      render()
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      map.dragPan.enable()
      dragging = null
      if (!moved) ends[kind] = null
      update()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  })

  map.on('move', render)

  map.on('click', (event) => {
    if (!placing || dragging) return
    // Klick på en plats öppnar dess lapp i stället (se attachPlaceNotes).
    if (map.getLayer('places') && map.queryRenderedFeatures(event.point, { layers: ['places'] }).length > 0) return
    const lngLat = event.lngLat.toArray()
    if (!ends.start) ends.start = lngLat
    else ends.goal = lngLat // första gången sätts målet, sedan flyttas det hit
    update()
  })

  report()
  render()

  return {
    setPlacing(value) {
      placing = value
      map.getCanvas().style.cursor = value ? 'crosshair' : ''
      report()
    },
    setStyle(value) {
      style = value
      report()
      render()
    },
    clear() {
      ends.start = null
      ends.goal = null
      request++
      update()
    },
  }
}
