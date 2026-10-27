// Klubbar utan nål på kartan (SCRUM-282): en symbol per område i stället för en
// lapp per klubb, så att de inte staplas på varandra. Symbolen står på den nivå
// klubbarna hör till:
//   - Sverige-nivån: hela Sverige och de tre landsdelarna (kartan har ingen egen
//     nivå för landsdelarna),
//   - landskapsnivån: det valda landskapet,
//   - länsvyn: det valda länet,
//   - kommunnivån: den valda kommunen (kommunklubbar utan nål).
// Ett klick på symbolen öppnar en lista med klubbarna i området, och ett klick i
// listan öppnar klubben. Klubbar med nål har kvar sina lappar (se
// mapPrototypeActivities.js).

import klubbarIcon from '../assets/klubbar.png'
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

// Så långt in från kartans kant står en symbol som annars skulle hamna utanför.
const EDGE_PX = 90

const countText = (n) => (n === 1 ? '1 klubb' : `${n} klubbar`)

// Gör om klubbarna till symboler: { key, scope, code, name, lngLat, landskap, clubs }.
// `kommuner` är en Map från kommunkod till { name, label } (se allKommuner).
// Bara klubbar utan nål räknas; de med nål står som lappar.
export function areaClubsFrom(groups, kommuner) {
  const areas = new Map()
  for (const group of groups) {
    if (group.latitude != null && group.longitude != null) continue
    const key = `${group.scope}:${group.scope_code}`
    if (!areas.has(key)) {
      const lngLat =
        group.scope === 'country'
          ? COUNTRY_POINT
          : group.scope === 'landsdel'
            ? LANDSDEL_POINTS[group.scope_code]
            : group.scope === 'landskap'
              ? landskapPoint(group.scope_code)
              : group.scope === 'lan'
                ? lanPoint(group.scope_code)
                : kommuner.get(group.scope_code)?.label
      if (!lngLat) continue
      areas.set(key, { key, scope: group.scope, code: group.scope_code, name: group.scope_name, lngLat, clubs: [] })
    }
    areas.get(key).clubs.push(group)
  }
  for (const area of areas.values()) area.clubs.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  return [...areas.values()]
}

// Kopplar symbolerna till kartan. `getView()` ger { mode, landskap, lan, kommun }
// (landskapets namn, länskod och kommunkod för det som är valt). `onOpen(group)`
// öppnar en klubb. Returnerar { setAreas, render }.
export function attachAreaClubs(map, layer, { getView, onOpen }) {
  let areas = []
  let openKey = null // symbolen vars lista är öppen

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
    const els = []
    for (const area of shown) {
      // Symbolen hör till nivån man är på, så den ska alltid synas: hamnar områdets punkt utanför
      // kartan (t.ex. inzoomat på centralorten) står den vid närmaste kant i stället.
      const point = map.project(area.lngLat)
      const x = Math.min(Math.max(point.x, EDGE_PX), width - EDGE_PX)
      const y = Math.min(Math.max(point.y, EDGE_PX), height - EDGE_PX)
      const el = symbolEl(area)
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      els.push(el)
      if (area.key === openKey) {
        const list = listEl(area)
        list.style.transform = `translate(${x}px, ${y}px) translate(-50%, 1.6rem)`
        els.push(list)
      }
    }
    layer.replaceChildren(...els)
  }

  function symbolEl(area) {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `map-activity is-klubb is-area${area.key === openKey ? ' is-open' : ''}`
    el.dataset.area = area.key
    el.setAttribute('aria-expanded', String(area.key === openKey))
    el.title = `Klubbar för ${area.name} (${countText(area.clubs.length)})`
    const icon = document.createElement('img')
    icon.src = klubbarIcon
    icon.alt = ''
    const text = document.createElement('span')
    text.className = 'map-activity-text'
    const title = document.createElement('span')
    title.className = 'map-activity-name'
    title.textContent = area.name
    const sub = document.createElement('span')
    sub.className = 'map-activity-sub'
    sub.textContent = countText(area.clubs.length)
    text.append(title, sub)
    el.append(icon, text)
    return el
  }

  function listEl(area) {
    const list = document.createElement('div')
    list.className = 'map-area-list'
    const heading = document.createElement('p')
    heading.className = 'map-area-list-title'
    heading.textContent = `Klubbar för ${area.name}`
    const items = document.createElement('ul')
    for (const group of area.clubs) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'map-area-list-club'
      button.dataset.club = String(group.id)
      button.textContent = group.name
      const interest = document.createElement('span')
      interest.textContent = group.interest_name
      button.append(interest)
      item.append(button)
      items.append(item)
    }
    list.append(heading, items)
    return list
  }

  layer.addEventListener('click', (event) => {
    const club = event.target.closest('.map-area-list-club')
    if (club) {
      const group = areas.flatMap((a) => a.clubs).find((g) => String(g.id) === club.dataset.club)
      openKey = null
      render()
      if (group) onOpen(group)
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
    render,
  }
}
