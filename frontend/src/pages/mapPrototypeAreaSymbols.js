// Klubbar och events utan nål på kartan (SCRUM-282, SCRUM-294): en symbol per
// område i stället för en lapp per klubb eller event, så att de inte staplas på
// varandra. Klubbarna och eventen har var sin symbol (vit respektive rosa hög).
// Symbolen står på den nivå klubbarna eller eventen hör till:
//   - Sverige-nivån: hela Sverige och de tre landsdelarna (kartan har ingen egen
//     nivå för landsdelarna),
//   - landskapsnivån: det valda landskapet,
//   - länsvyn: det valda länet,
//   - kommunnivån: den valda kommunen (kommunklubbar utan nål, och events utan
//     nål och utan större område, i den kommun de hör till, se activitiesFrom).
// Ett klick på symbolen öppnar en lista, och ett klick i listan öppnar klubben
// eller eventet. Klubbar och events med nål har kvar sina lappar (se
// mapPrototypeActivities.js).
//
// Symbolen står still på sin plats på kartan, som lapparna: det är lapparna
// (events och klubbar med nål) som flyttas undan för den. Utzoomat är den, som
// lapparna, bara högen med antalet; namnet syns när man hovrar. Står en klubb-
// och en eventsymbol på samma ställe hamnar de bredvid varandra.

import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'
import { FULL_ZOOM } from './mapPrototypeActivities'
import { LANDSKAP_LABELS, LAN_LABELS } from './mapPrototypeStyle'

// Var symbolerna för hela Sverige och landsdelarna står: ungefär mitt i varje
// landsdel, och hela Sverige i fjällen, där inga namn står.
const COUNTRY_POINT = [13.2, 63.6]
const LANDSDEL_POINTS = { gotaland: [14.6, 57.3], svealand: [15.4, 59.7], norrland: [18.6, 65.6] }

// Länets namnpunkt: den största delen av länet (ett län kan ligga i flera landskap).
function lanPoint(code) {
  const parts = LAN_LABELS.filter((l) => l.id === code)
  return parts.sort((a, b) => b.km2 - a.km2)[0]?.lngLat ?? null
}

const landskapPoint = (code) => LANDSKAP_LABELS.find((l) => String(l.id) === code)?.lngLat ?? null

function areaPoint(scope, code, kommuner) {
  if (scope === 'country') return COUNTRY_POINT
  if (scope === 'landsdel') return LANDSDEL_POINTS[code]
  if (scope === 'landskap') return landskapPoint(code)
  if (scope === 'lan') return lanPoint(code)
  return kommuner.get(code)?.label
}

const KINDS = {
  klubb: { icon: klubbarIcon, one: 'Klubb', many: 'Klubbar', of: 'Klubbar för' },
  event: { icon: eventIcon, one: 'Event', many: 'Events', of: 'Events i' },
}

const shortDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })

// Gör om klubbarna och eventen till symboler: { key, kind, scope, code, name, lngLat, items }, där items är
// [{ type, id, name, sub, booked }]. `kommuner` är en Map från kommunkod till { name, label } (se allKommuner).
// `eventItems` är eventens lappar från activitiesFrom, för kommunen ett event utan nål hör till. Bara klubbar och
// events utan nål räknas; de med nål står som lappar.
export function areasFrom({ groups, events = [], eventItems = [], kommuner }) {
  const areas = new Map()
  function add(kind, scope, code, name, entry) {
    const key = `${kind}:${scope}:${code}`
    if (!areas.has(key)) {
      const lngLat = areaPoint(scope, code, kommuner)
      if (!lngLat) return
      areas.set(key, { key, kind, scope, code, name: name ?? kommuner.get(code)?.name ?? code, lngLat, items: [] })
    }
    areas.get(key).items.push(entry)
  }
  for (const group of groups) {
    if (group.latitude != null && group.longitude != null) continue
    add('klubb', group.scope, group.scope_code, group.scope_name, {
      type: 'klubb',
      id: group.id,
      name: group.name,
      sub: group.interest_name,
    })
  }
  const kommunOf = new Map(eventItems.filter((i) => i.type === 'event').map((i) => [i.id, i]))
  const now = Date.now()
  for (const event of events) {
    if (event.latitude != null && event.longitude != null) continue
    if (new Date(event.ends_at ?? event.starts_at).getTime() < now) continue
    const entry = {
      type: 'event',
      id: event.id,
      name: event.title,
      sub: shortDate.format(new Date(event.starts_at)),
      booked: event.is_owner || event.my_answer === 'yes' || event.my_answer === 'maybe',
    }
    if (event.scope) add('event', event.scope, event.scope_code, event.scope_name, entry)
    else if (kommunOf.get(event.id)?.kommun) add('event', 'kommun', kommunOf.get(event.id).kommun, null, entry)
  }
  for (const area of areas.values()) area.items.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  return [...areas.values()]
}

// Luft i pixlar mellan symbolen och listan under den, och mellan två symboler på samma ställe.
const GAP_PX = 6
// En kommuns symbol står så här högt ovanför platsen kartan flyger till (se
// setKommunCenter), så att den inte täcker ortens namn.
const KOMMUN_LIFT_PX = 46

// Kopplar symbolerna till kartan. `getView()` ger { mode, landskap, lan, kommun }
// (landskapets namn, länskod och kommunkod för det som är valt). `onOpen({ type, id })`
// öppnar en klubb eller ett event. Returnerar { setAreas, setKommunCenter, render, boxes }:
// boxes() ger symbolernas rektanglar på skärmen, som lapparna flyttas undan för.
export function attachAreaSymbols(map, layer, { getView, onOpen }) {
  let areas = []
  let openKey = null // symbolen vars lista är öppen
  // Var kartan stannar när man går till en kommun (centralorten, eller ens stadsdel), per kommunkod.
  // Kommunens symboler står där i stället för vid kommunens namnpunkt, så att de syns när man kommer dit.
  const kommunCenters = new Map()

  // Vilka symboler som hör till nivån man är på.
  function visible() {
    const { mode, landskap, lan, kommun } = getView()
    if (mode === 'sverige') return areas.filter((a) => a.scope === 'country' || a.scope === 'landsdel')
    if (mode === 'landskap') {
      const code = String(LANDSKAP_LABELS.find((l) => l.name === landskap)?.id ?? '')
      return areas.filter((a) => a.scope === 'landskap' && a.code === code)
    }
    if (kommun) return areas.filter((a) => a.scope === 'kommun' && a.code === kommun)
    if (lan) return areas.filter((a) => a.scope === 'lan' && a.code === lan)
    return []
  }

  function render() {
    const shown = visible()
    if (!shown.some((a) => a.key === openKey)) openKey = null
    const width = layer.clientWidth
    const height = layer.clientHeight
    const compact = map.getZoom() < FULL_ZOOM
    const placed = []
    for (const area of shown) {
      const center = area.scope === 'kommun' ? kommunCenters.get(area.code) : null
      const point = map.project(center ?? area.lngLat)
      const y = center ? point.y - KOMMUN_LIFT_PX : point.y
      if (point.x < -200 || point.x > width + 200 || y < -200 || y > height + 200) continue
      placed.push({ el: symbolEl(area, compact && area.key !== openKey), area, x: point.x, y })
    }
    layer.replaceChildren(...placed.map((p) => p.el))
    // Klubbarnas och eventens symbol för samma område står på samma punkt: lägg dem bredvid varandra.
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i]
      const twin = placed.slice(0, i).find((q) => q.area.scope === p.area.scope && q.area.code === p.area.code)
      if (twin) {
        const shift = (twin.el.offsetWidth + p.el.offsetWidth) / 2 + GAP_PX * 3
        twin.x -= shift / 2
        p.x = twin.x + shift
      }
    }
    for (const p of placed) {
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
      if (p.area.key !== openKey) continue
      const list = listEl(p.area)
      list.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, ${p.el.offsetHeight / 2 + GAP_PX}px)`
      layer.append(list)
    }
  }

  // Symbolernas rektanglar, relativt kartan, för lapparna att flytta sig undan för.
  function boxes() {
    const origin = layer.getBoundingClientRect()
    return [...layer.querySelectorAll('.map-activity.is-area')].map((el) => {
      const r = el.getBoundingClientRect()
      // Stämpeln och lapparna bakom sticker ut lite.
      return { left: r.left - origin.left - 8, right: r.right - origin.left + 8, top: r.top - origin.top - 10, bottom: r.bottom - origin.top + 8 }
    })
  }

  function symbolEl(area, compact) {
    const kind = KINDS[area.kind]
    const count = area.items.length
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `map-activity is-${area.kind} is-area${area.key === openKey ? ' is-open' : ''}${compact ? ' is-compact' : ''}`
    el.dataset.area = area.key
    el.setAttribute('aria-expanded', String(area.key === openKey))
    el.title = `${kind.of} ${area.name} (${count})`
    const icon = document.createElement('img')
    icon.src = kind.icon
    icon.alt = ''
    const text = document.createElement('span')
    text.className = 'map-activity-text'
    const title = document.createElement('span')
    title.className = 'map-activity-name'
    title.textContent = area.name
    const sub = document.createElement('span')
    sub.className = 'map-activity-sub'
    sub.textContent = count === 1 ? kind.one : kind.many
    text.append(title, sub)
    // En liten hög med lappar: den översta (.map-area-card) med ikonen och texten, två färgade bakom
    // (se .map-activity.is-area i map.css), och antalet i en rund stämpel i hörnet.
    const card = document.createElement('span')
    card.className = 'map-area-card'
    card.append(icon, text)
    const badge = document.createElement('span')
    badge.className = 'map-area-count'
    badge.textContent = String(count)
    badge.setAttribute('aria-hidden', 'true')
    el.append(card, badge)
    return el
  }

  function listEl(area) {
    const list = document.createElement('div')
    list.className = 'map-area-list'
    const heading = document.createElement('p')
    heading.className = 'map-area-list-title'
    heading.textContent = `${KINDS[area.kind].of} ${area.name}`
    const items = document.createElement('ul')
    for (const entry of area.items) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `map-area-list-club${entry.booked ? ' is-booked' : ''}`
      button.dataset.type = entry.type
      button.dataset.id = String(entry.id)
      button.textContent = entry.name
      const sub = document.createElement('span')
      sub.textContent = entry.booked ? `${entry.sub} · du är anmäld` : entry.sub
      button.append(sub)
      item.append(button)
      items.append(item)
    }
    list.append(heading, items)
    // Hjul, drag och dubbelklick i listan ska rulla listan, inte zooma eller flytta kartan.
    for (const type of ['wheel', 'mousedown', 'pointerdown', 'touchstart', 'touchmove', 'dblclick']) {
      list.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
    }
    return list
  }

  layer.addEventListener('click', (event) => {
    const entry = event.target.closest('.map-area-list-club')
    if (entry) {
      openKey = null
      render()
      onOpen({ type: entry.dataset.type, id: Number(entry.dataset.id) })
      return
    }
    const symbol = event.target.closest('.map-activity.is-area')
    if (!symbol) return
    openKey = openKey === symbol.dataset.area ? null : symbol.dataset.area
    render()
  })

  // Esc eller ett klick på kartan stänger listan.
  map.on('click', () => {
    if (openKey === null) return
    openKey = null
    render()
  })
  layer.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || openKey === null) return
    const key = openKey
    openKey = null
    render()
    layer.querySelector(`[data-area="${key}"]`)?.focus()
  })

  map.on('move', render)
  map.on('resize', render)

  return {
    setAreas(next) {
      areas = next
      render()
    },
    // Platsen kartan flyger till i kommunen [longitud, latitud] (se flyToPlaceIn i MapPrototype.jsx).
    setKommunCenter(kod, lngLat) {
      kommunCenters.set(kod, lngLat)
      render()
    },
    render,
    boxes,
  }
}
