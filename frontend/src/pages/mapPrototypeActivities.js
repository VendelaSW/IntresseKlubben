// PROTOTYP: klubbar och events på kartan, som små papperslappar med appens
// ikoner. Varken klubbar eller events har koordinater i backend än, så
// platsen är ungefärlig:
//   - en klubb står mitt i sin kommun (kommunens namnpunkt),
//   - ett event står i sin klubbs kommun, annars i en kommun vars namn finns
//     i adressen eller platsens namn, annars visas det inte,
// Lapparna syns bara på kommunnivå, och bara den valda kommunens. Utzoomat är de bara ikonen (namnet syns när man hovrar), inzoomat
// hela lappen. Lappar som skulle krocka knuffas isär i höjdled, så att de på
// samma ställe hamnar i en kolumn.

import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import { lanCodeAt } from './mapPrototypeZoomLevels'

// Längre ut än så här blir lapparna för många och för små.
const MIN_ZOOM = 6
// Inzoomat (från den här zoomen) visas hela lappen, annars bara ikonen.
const FULL_ZOOM = 9
// Luft i pixlar mellan lappar.
const GAP_PX = 4

const normalize = (text) =>
  text
    .toLocaleLowerCase('sv')
    .replace(/[^a-zåäöéü0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const shortDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })

// Gör om klubbar och events från API:t till lappar med plats. `kommuner` är
// en Map från kommunkod till { name, label } (label = [longitud, latitud]).
export function activitiesFrom({ groups, events, kommuner }) {
  const items = []
  const groupKommun = new Map()
  for (const group of groups) {
    const kommun = kommuner.get(group.municipality_code)
    if (!kommun?.label) continue
    groupKommun.set(group.id, kommun)
    items.push({ type: 'klubb', id: group.id, name: group.name, sub: kommun.name, lngLat: kommun.label, kommun: kommun.kod })
  }
  // Kommunnamnen, längst först, så att t.ex. "Upplands Väsby" vinner över "Väsby".
  const byName = [...kommuner.values()].sort((a, b) => b.name.length - a.name.length)
  const now = Date.now()
  for (const event of events) {
    if (new Date(event.ends_at ?? event.starts_at).getTime() < now) continue
    const text = ` ${normalize(`${event.place_name} ${event.address}`)} `
    const kommun =
      groupKommun.get(event.group_id) ?? byName.find((k) => text.includes(` ${normalize(k.name)} `)) ?? null
    if (!kommun?.label) continue
    items.push({
      type: 'event',
      id: event.id,
      name: event.title,
      sub: shortDate.format(new Date(event.starts_at)),
      lngLat: kommun.label,
      kommun: kommun.kod,
    })
  }
  for (const item of items) item.lan = lanCodeAt(item.lngLat)
  return items
}

// Kopplar lapparna till kartan. `getKommun()` ger den valda kommunen
// (kommunkod) på kommunnivå, annars null: lapparna syns bara då, och bara den
// kommunens klubbar och events. `onPick(item)` anropas vid klick. Returnerar
// { setItems, getItem, highlight, render }.
export function attachActivityMarkers(map, layer, { getKommun, onPick }) {
  let items = []

  function render() {
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
    for (let pass = 0; pass < 8; pass++) {
      placed.sort((a, b) => a.y - b.y)
      let changed = false
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
    el.className = `map-activity is-${item.type}${compact ? ' is-compact' : ''}`
    el.dataset.key = `${item.type}:${item.id}`
    el.title = `${item.name} (${item.sub})`
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
    if (item) onPick(item)
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
    highlight,
    render,
  }
}
