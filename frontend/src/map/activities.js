// PROTOTYP: klubbar och events på kartan, som små papperslappar med appens
// ikoner. Har klubben (träffplatsen) eller eventet en position (latitude och
// longitude, satt med nålen i formuläret) står lappen där, i den kommun
// positionen ligger i. Annars är platsen ungefärlig:
//   - en klubb utan nål visas inte som en egen lapp, utan i symbolen för sitt
//     område (se map/areaSymbols.js); den har ändå en plats mitt i sin
//     kommun (kommunens namnpunkt), för sökrutan,
//   - ett event står i sin klubbs kommun, annars i en kommun vars namn finns
//     i adressen eller platsens namn, annars visas det inte,
// Lapparna syns bara på kommunnivå, och bara den valda kommunens. Utzoomat är de bara ikonen (namnet syns när man hovrar), inzoomat
// hela lappen. Lappar som skulle krocka knuffas isär i höjdled, så att de på
// samma ställe hamnar i en kolumn.
//
// Klubbar är vita och events rosa. Ens egna events är det viktigaste kartan
// visar, så de är lite större och ligger överst: de man arrangerar (skapat
// eller är medarrangör för) är gula, appens färg, och de man ska gå på (Ja
// eller Kanske) starkt rosa. Utzoomat blir klubbarna en ikon, och eventen en
// platsnål i samma färg med eventloggan i en vit cirkel (spetsen på platsen).
// Utzoomat slås också lappar som hamnar nära varandra ihop till en med antalet
// (klustren, se clustersFor), och ett tryck på den zoomar in tills de delas upp.

import Supercluster from 'supercluster'
import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import { isInside, lanCodeAt } from './zoomLevels'

// Hur långt fram events visas på kartan (väljaren i kartans översta rad, se MapPage). `days` räknas i hela
// dagar från i dag: "Idag" är resten av dagen, "3 dagar" i dag och de två nästa, och så vidare.
export const EVENT_RANGES = [
  { id: 'idag', label: 'Idag', days: 1 },
  { id: '3', label: '3 dagar', days: 3 },
  { id: '7', label: '1 vecka', days: 7 },
  { id: '14', label: '14 dagar', days: 14 },
  { id: '30', label: '1 månad', days: 30 },
]
export const DEFAULT_EVENT_RANGE = '14'

// De events som börjar inom intervallet (eller redan har börjat). Ens egna (som arrangör, med Ja eller Kanske, eller
// med en ansökan) syns alltid, hur långt fram de än ligger, så att det man själv bryr sig om inte försvinner.
export function eventsWithin(events, rangeId, now = new Date()) {
  const days = (EVENT_RANGES.find((r) => r.id === rangeId) ?? EVENT_RANGES.find((r) => r.id === DEFAULT_EVENT_RANGE)).days
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + days)
  return events.filter(
    (event) =>
      event.is_host ||
      event.my_answer === 'yes' ||
      event.my_answer === 'maybe' ||
      event.has_applied ||
      new Date(event.starts_at) < end,
  )
}

// Längre ut än så här blir lapparna för många och för små.
const MIN_ZOOM = 6
// Inzoomat (från den här zoomen, strax innan gatunivån) visas hela lappen,
// annars bara ikonen (namnet syns när man hovrar). Används också av kartan när
// den flyger till en lapp utan exakt plats, så att lappen är hel när den landar.
export const FULL_ZOOM = 14
// Luft i pixlar mellan lappar.
const GAP_PX = 4
// Utzoomat slås lappar som ligger närmare varandra än så här (i pixlar på skärmen) ihop till en, med antalet (se
// clustersFor). Inzoomat, från FULL_ZOOM, står alla för sig.
const CLUSTER_RADIUS_PX = 48

const normalize = (text) =>
  text
    .toLocaleLowerCase('sv')
    .replace(/[^a-zåäöéü0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const shortDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })

// Positionen [longitud, latitud] för en klubb eller ett event, eller null.
const positionOf = (item) => (item.latitude != null && item.longitude != null ? [item.longitude, item.latitude] : null)

// Gör om klubbar och events från API:t till lappar med plats. `kommuner` är
// en Map från kommunkod till { name, label, geometry, bbox } (label =
// [longitud, latitud]).
export function activitiesFrom({ groups, events, kommuner }) {
  const items = []
  // Kommunen en position ligger i, eller null (t.ex. ute i havet).
  const kommunAt = ([lng, lat]) =>
    [...kommuner.values()].find(
      (k) =>
        k.bbox &&
        lng >= k.bbox[0] &&
        lng <= k.bbox[2] &&
        lat >= k.bbox[1] &&
        lat <= k.bbox[3] &&
        isInside(k.geometry, [lng, lat]),
    ) ?? null
  const groupKommun = new Map()
  for (const group of groups) {
    const own = kommuner.get(group.municipality_code)
    const position = positionOf(group)
    const kommun = (position && kommunAt(position)) ?? own
    if (!kommun?.label) continue
    if (own) groupKommun.set(group.id, own)
    items.push({
      type: 'klubb',
      id: group.id,
      name: group.name,
      sub: group.place_name ?? kommun.name,
      lngLat: position ?? kommun.label,
      exact: Boolean(position),
      kommun: kommun.kod,
    })
  }
  // Kommunnamnen, längst först, så att t.ex. "Upplands Väsby" vinner över "Väsby".
  const byName = [...kommuner.values()].sort((a, b) => b.name.length - a.name.length)
  const now = Date.now()
  for (const event of events) {
    if (new Date(event.ends_at ?? event.starts_at).getTime() < now) continue
    const position = positionOf(event)
    const text = ` ${normalize(`${event.place_name} ${event.address}`)} `
    const kommun =
      (position && kommunAt(position)) ??
      groupKommun.get(event.group_id) ??
      byName.find((k) => text.includes(` ${normalize(k.name)} `)) ??
      null
    if (!kommun?.label) continue
    items.push({
      type: 'event',
      id: event.id,
      name: event.title,
      sub: shortDate.format(new Date(event.starts_at)),
      lngLat: position ?? kommun.label,
      exact: Boolean(position),
      kommun: kommun.kod,
      mine: event.is_host,
      booked: !event.is_host && (event.my_answer === 'yes' || event.my_answer === 'maybe'),
    })
  }
  for (const item of items) item.lan = lanCodeAt(item.lngLat)
  return items
}

// Kopplar lapparna till kartan. `getKommun()` ger den valda kommunen
// (kommunkod) på kommunnivå, annars null: då syns den kommunens klubbar och
// events. Utan vald kommun ger `getLan()` länet (länskod) på den fria nivån, och
// då syns länets; utan någon av dem inga. Utzoomat slås de ihop (se clustersFor),
// så att också ett helt län går att visa. `onPick(item, compact)` anropas vid klick,
// med om lappen var hopfälld till en ikon. `getFixed()` ger rektanglar som
// står still (symbolerna för klubbar utan nål, se map/areaSymbols.js):
// lapparna flyttas undan för dem. Returnerar
// { setItems, getItem, highlight, render }.
export function attachActivityMarkers(map, layer, { getKommun, getLan = () => null, onPick, getFixed = () => [] }) {
  let items = []

  // Vilka lappar som syns: den valda kommunens, annars länets (se ovan), eller null om inga.
  function scope() {
    const kommun = getKommun()
    if (kommun) return { key: `kommun:${kommun}`, has: (item) => item.kommun === kommun }
    const lan = getLan()
    if (lan) return { key: `lan:${lan}`, has: (item) => item.lan === lan }
    return null
  }

  // Klustren: klubbar och events var för sig, bland de lappar som syns (supercluster, samma som MapLibre använder).
  // De byggs om när lapparna eller det som syns ändras. Ett kluster vet om något av dess events är ens eget eller
  // bokat.
  let clusterCache = null
  function clustersFor(shown) {
    if (clusterCache?.key === shown.key && clusterCache.items === items) return clusterCache.indexes
    const indexes = {}
    for (const type of ['klubb', 'event']) {
      const index = new Supercluster({
        radius: CLUSTER_RADIUS_PX,
        maxZoom: FULL_ZOOM - 1,
        map: (props) => ({ mine: props.item.mine ? 1 : 0, booked: props.item.booked ? 1 : 0 }),
        reduce: (sum, props) => {
          sum.mine += props.mine
          sum.booked += props.booked
        },
      })
      index.load(
        items
          .filter((i) => i.type === type && shown.has(i) && i.exact)
          .map((item) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: item.lngLat }, properties: { item } })),
      )
      indexes[type] = index
    }
    clusterCache = { key: shown.key, items, indexes }
    return indexes
  }

  // Lapparna ritas om när kartan rör sig, så en lapp som har
  // tangentbordsfokus får tillbaka det efter omritningen.
  function render() {
    const focused = layer.contains(document.activeElement) ? document.activeElement.dataset.key : null
    draw()
    if (focused) layer.querySelector(`[data-key="${focused}"]`)?.focus({ preventScroll: true })
  }

  function draw() {
    const shown = scope()
    if (!shown || map.getZoom() < MIN_ZOOM) {
      layer.replaceChildren()
      return
    }
    const compact = map.getZoom() < FULL_ZOOM
    const width = layer.clientWidth
    const height = layer.clientHeight
    const placed = []
    const onScreen = ({ x, y }) => x >= -200 && x <= width + 200 && y >= -200 && y <= height + 200
    if (compact) {
      // Utzoomat: lappar nära varandra slås ihop till en med antalet (klustren), så att kartan inte fylls av dem.
      const indexes = clustersFor(shown)
      const bounds = map.getBounds()
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
      const zoom = Math.floor(map.getZoom())
      for (const [type, index] of Object.entries(indexes)) {
        for (const feature of index.getClusters(bbox, zoom)) {
          const point = map.project(feature.geometry.coordinates)
          if (!onScreen(point)) continue
          const el = feature.properties.cluster
            ? clusterEl(type, feature)
            : markerEl(feature.properties.item, compact)
          placed.push({ x: point.x, y: point.y, el })
        }
      }
    } else {
      for (const item of items) {
        if (!shown.has(item)) continue
        // Klubbar och events utan nål finns i kommunens symbol (se map/areaSymbols.js).
        if (!item.exact) continue
        const point = map.project(item.lngLat)
        if (!onScreen(point)) continue
        placed.push({ item, x: point.x, y: point.y, el: markerEl(item, compact) })
      }
    }
    // Lägg ut lapparna för att kunna mäta dem, och knuffa sedan isär dem som
    // överlappar (uppifrån och ner, några varv).
    layer.replaceChildren(...placed.map((p) => p.el))
    for (const p of placed) {
      p.w = p.el.offsetWidth
      p.h = p.el.offsetHeight
      // En nål står med spetsen på platsen, inte mitten.
      if (p.el.classList.contains('is-pin')) p.y -= p.h / 2
    }
    const fixed = getFixed()
    for (let pass = 0; pass < 8; pass++) {
      placed.sort((a, b) => a.y - b.y)
      let changed = false
      // En lapp som täcker en symbol flyttas ovanför eller under den (dit den har närmast).
      for (const p of placed) {
        for (const f of fixed) {
          const left = p.x - p.w / 2
          const top = p.y - p.h / 2
          if (left < f.right && left + p.w > f.left && top < f.bottom && top + p.h > f.top) {
            p.y = p.y < (f.top + f.bottom) / 2 ? f.top - p.h / 2 - GAP_PX : f.bottom + p.h / 2 + GAP_PX
            changed = true
          }
        }
      }
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]
          const b = placed[j]
          const needed = (a.h + b.h) / 2 + GAP_PX
          if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP_PX && b.y - a.y < needed) {
            const push = (needed - (b.y - a.y)) / 2
            a.y -= push
            b.y += push
            changed = true
          }
        }
      }
      if (!changed) break
    }
    for (const p of placed) {
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
      if (p.el.dataset.key === highlighted) p.el.classList.add('is-highlighted')
    }
  }

  function markerEl(item, compact) {
    const el = document.createElement('button')
    el.type = 'button'
    // Utzoomat är ett event en platsnål (se .is-pin i map.css), med ikonen i nålens vita cirkel.
    const pin = compact && item.type === 'event'
    el.className = `map-activity is-${item.type}${item.mine ? ' is-mine' : ''}${item.booked ? ' is-booked' : ''}${compact ? ' is-compact' : ''}${pin ? ' is-pin' : ''}`
    el.dataset.key = `${item.type}:${item.id}`
    el.title = `${item.name} (${item.sub}${item.mine ? ', ditt event' : item.booked ? ', du är anmäld' : ''})`
    const icon = document.createElement('img')
    icon.src = item.type === 'klubb' ? klubbarIcon : eventIcon
    icon.alt = ''
    const text = document.createElement('span')
    text.className = 'map-activity-text'
    const title = document.createElement('span')
    title.className = 'map-activity-name'
    title.textContent = item.name
    const sub = document.createElement('span')
    sub.className = 'map-activity-sub'
    sub.textContent = item.sub
    text.append(title, sub)
    if (pin) el.append(pinShape())
    el.append(icon, text)
    return el
  }

  // Flera lappar som slagits ihop: samma ikon (en nål för events) med antalet i en liten etikett. Ett tryck zoomar in
  // så att de delas upp (se klicket nedan). Ens egna och bokade events syns på klustrets färg.
  function clusterEl(type, feature) {
    const { cluster_id: id, point_count: count, mine, booked } = feature.properties
    const el = document.createElement('button')
    el.type = 'button'
    const pin = type === 'event'
    el.className = `map-activity is-${type} is-compact is-cluster${pin ? ' is-pin' : ''}${mine ? ' is-mine' : booked ? ' is-booked' : ''}`
    el.dataset.key = `kluster:${type}:${id}`
    el.dataset.cluster = String(id)
    el.dataset.clusterType = type
    el.dataset.lngLat = feature.geometry.coordinates.join(',')
    const what = type === 'klubb' ? 'klubbar' : 'events'
    el.title = `${count} ${what} här. Klicka för att zooma in.`
    el.setAttribute('aria-label', el.title)
    const icon = document.createElement('img')
    icon.src = type === 'klubb' ? klubbarIcon : eventIcon
    icon.alt = ''
    const badge = document.createElement('span')
    badge.className = 'map-activity-count'
    badge.textContent = count
    if (pin) el.append(pinShape())
    el.append(icon, badge)
    return el
  }

  // Nålen: en droppe med bläckkant och en vit cirkel för ikonen, ritad som de andra figurerna på kartan.
  function pinShape() {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('class', 'map-activity-pin')
    svg.setAttribute('viewBox', '0 0 32 42')
    svg.setAttribute('aria-hidden', 'true')
    const drop = document.createElementNS(ns, 'path')
    drop.setAttribute('class', 'map-activity-pin-drop')
    drop.setAttribute('d', 'M16 40.4 C10.6 32 2.4 24.6 2.4 15.6 A13.6 13.6 0 1 1 29.6 15.6 C29.6 24.6 21.4 32 16 40.4 Z')
    const hole = document.createElementNS(ns, 'circle')
    hole.setAttribute('class', 'map-activity-pin-hole')
    hole.setAttribute('cx', '16')
    hole.setAttribute('cy', '15.6')
    hole.setAttribute('r', '9.4')
    svg.append(drop, hole)
    return svg
  }

  layer.addEventListener('click', (event) => {
    const el = event.target.closest('.map-activity')
    if (!el) return
    // Ett kluster: zooma in precis så mycket att det delas upp, mot klustrets mitt.
    if (el.dataset.cluster) {
      const index = clusterCache?.indexes[el.dataset.clusterType]
      if (!index) return
      const zoom = Math.min(index.getClusterExpansionZoom(Number(el.dataset.cluster)), FULL_ZOOM)
      map.easeTo({ center: el.dataset.lngLat.split(',').map(Number), zoom })
      return
    }
    const item = items.find((i) => `${i.type}:${i.id}` === el.dataset.key)
    if (item) onPick(item, el.classList.contains('is-compact'))
  })

  map.on('move', render)
  map.on('resize', render)

  // Markera en lapp en stund (efter "Visa på kartan").
  let highlighted = null
  function highlight(key) {
    highlighted = key
    render()
    setTimeout(() => {
      if (highlighted === key) highlighted = null
      render()
    }, 4000)
  }

  return {
    setItems(next) {
      items = next
      render()
    },
    getItem: (type, id) => items.find((i) => i.type === type && i.id === id) ?? null,
    // Lägger till eller ersätter en lapp (t.ex. ett event som nyss skapats).
    putItem(item) {
      items = [...items.filter((i) => !(i.type === item.type && i.id === item.id)), item]
      render()
    },
    highlight,
    render,
  }
}
