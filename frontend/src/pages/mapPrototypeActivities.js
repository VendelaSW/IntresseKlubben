// PROTOTYP: klubbar och events på kartan, som små papperslappar med appens
// ikoner. Har klubben (träffplatsen) eller eventet en position (latitude och
// longitude, satt med nålen i formuläret) står lappen där, i den kommun
// positionen ligger i. Annars är platsen ungefärlig:
//   - en klubb utan nål visas inte som en egen lapp, utan i symbolen för sitt
//     område (se mapPrototypeAreaClubs.js); den har ändå en plats mitt i sin
//     kommun (kommunens namnpunkt), för sökrutan,
//   - ett event står i sin klubbs kommun, annars i en kommun vars namn finns
//     i adressen eller platsens namn, annars visas det inte,
// Lapparna syns bara på kommunnivå, och bara den valda kommunens. Utzoomat är de bara ikonen (namnet syns när man hovrar), inzoomat
// hela lappen. Lappar som skulle krocka knuffas isär i höjdled, så att de på
// samma ställe hamnar i en kolumn.
//
// Klubbar är vita och events rosa. Ens bokade events (samma som "Mina events"
// i appen: de man skapat eller svarat Ja eller Kanske på) är det viktigaste
// kartan visar, så de är starkt rosa, lite större och ligger överst. Utzoomat
// blir de en ikon som alla andra lappar.

import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import { isInside, lanCodeAt } from './mapPrototypeZoomLevels'

// Längre ut än så här blir lapparna för många och för små.
const MIN_ZOOM = 6
// Inzoomat (från den här zoomen, strax innan gatunivån) visas hela lappen,
// annars bara ikonen (namnet syns när man hovrar). Används också av kartan när
// den flyger till en lapp utan exakt plats, så att lappen är hel när den landar.
export const FULL_ZOOM = 14
// Luft i pixlar mellan lappar.
const GAP_PX = 4

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
      booked: event.is_owner || event.my_answer === 'yes' || event.my_answer === 'maybe',
    })
  }
  for (const item of items) item.lan = lanCodeAt(item.lngLat)
  return items
}

// Kopplar lapparna till kartan. `getKommun()` ger den valda kommunen
// (kommunkod) på kommunnivå, annars null: lapparna syns bara då, och bara den
// kommunens klubbar och events. `onPick(item, compact)` anropas vid klick,
// med om lappen var hopfälld till en ikon. `getFixed()` ger rektanglar som
// står still (symbolerna för klubbar utan nål, se mapPrototypeAreaClubs.js):
// lapparna flyttas undan för dem. Returnerar
// { setItems, getItem, highlight, render }.
export function attachActivityMarkers(map, layer, { getKommun, onPick, getFixed = () => [] }) {
  let items = []

  // Lapparna ritas om när kartan rör sig, så en lapp som har
  // tangentbordsfokus får tillbaka det efter omritningen.
  function render() {
    const focused = layer.contains(document.activeElement) ? document.activeElement.dataset.key : null
    draw()
    if (focused) layer.querySelector(`[data-key="${focused}"]`)?.focus({ preventScroll: true })
  }

  function draw() {
    const kommun = getKommun()
    if (!kommun || map.getZoom() < MIN_ZOOM) {
      layer.replaceChildren()
      return
    }
    const compact = map.getZoom() < FULL_ZOOM
    const width = layer.clientWidth
    const height = layer.clientHeight
    const placed = []
    for (const item of items) {
      if (item.kommun !== kommun) continue
      // Klubbar utan nål finns i kommunens symbol (se mapPrototypeAreaClubs.js).
      if (item.type === 'klubb' && !item.exact) continue
      const { x, y } = map.project(item.lngLat)
      if (x < -200 || x > width + 200 || y < -200 || y > height + 200) continue
      placed.push({ item, x, y, el: markerEl(item, compact) })
    }
    // Lägg ut lapparna för att kunna mäta dem, och knuffa sedan isär dem som
    // överlappar (uppifrån och ner, några varv).
    layer.replaceChildren(...placed.map((p) => p.el))
    for (const p of placed) {
      p.w = p.el.offsetWidth
      p.h = p.el.offsetHeight
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
    el.className = `map-activity is-${item.type}${item.booked ? ' is-booked' : ''}${compact ? ' is-compact' : ''}`
    el.dataset.key = `${item.type}:${item.id}`
    el.title = `${item.name} (${item.sub}${item.booked ? ', du är anmäld' : ''})`
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
    el.append(icon, text)
    return el
  }

  layer.addEventListener('click', (event) => {
    const el = event.target.closest('.map-activity')
    if (!el) return
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
