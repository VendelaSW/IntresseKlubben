// Pilar efter "Hitta mig" (SCRUM-71): klubbar och events i ens kommun som ligger
// utanför skärmen visas vid skärmens kant, med en pil dit och avståndet från en
// själv. Klick flyger dit. Bara de med nål: de utan nål har ingen egen plats (de
// står mitt i kommunen, se mapPrototypeActivities.js), så avståndet vore påhittat.

import eventIcon from '../assets/event.png'
import klubbarIcon from '../assets/klubbar.png'

// Fler än så här blir bara rörigt, och i en storstad kan det finnas hundratals.
const MAX_ARROWS = 4
const KM_PER_DEGREE = 111.32
// Kartan lutar (se TILT i MapPrototype.jsx), så avstånd i nord-sydlig led ser kortare ut på skärmen.
const TILT_SQUEEZE = Math.cos((45 * Math.PI) / 180)
// Luft mot skärmens kanter i pixlar, så att pilarna inte hamnar under knapparna
// upptill och blocken nedtill. Mitten av pilen, så det räknar in dess halva storlek.
const EDGE = { top: 120, right: 50, bottom: 120, left: 50 }
const GAP_PX = 4

function kmBetween([lng1, lat1], [lng2, lat2]) {
  return Math.hypot((lng1 - lng2) * Math.cos((lat1 * Math.PI) / 180), lat1 - lat2) * KM_PER_DEGREE
}

function distanceText(km) {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  return `${km.toLocaleString('sv-SE', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

function overlap(a, b) {
  return a.left < b.right + GAP_PX && b.left < a.right + GAP_PX && a.top < b.bottom + GAP_PX && b.top < a.bottom + GAP_PX
}

function arrowEl(item, onPick) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `map-nearby is-${item.type}`
  el.addEventListener('click', () => onPick(item))
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  arrow.setAttribute('viewBox', '0 0 12 12')
  arrow.setAttribute('aria-hidden', 'true')
  arrow.classList.add('map-nearby-arrow')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M6 11V1.8M2.3 5.5 6 1.8l3.7 3.7')
  arrow.append(path)
  const icon = document.createElement('img')
  icon.src = item.type === 'klubb' ? klubbarIcon : eventIcon
  icon.alt = ''
  const distance = document.createElement('span')
  el.append(arrow, icon, distance)
  return el
}

// `getKommun()` ger den valda kommunen (kommunkod) och `onPick(item)` anropas vid
// klick. Returnerar { setItems, setPosition }; `setPosition(lngLat, kommun)` är var
// man är och i vilken kommun. Pilarna syns bara medan den kommunen är vald.
export function attachNearbyArrows(map, layer, { getKommun, onPick }) {
  let items = []
  let me = null
  const shown = new Map() // nyckel -> knappen, som återanvänds så att klick och fokus håller medan kartan rör sig
  layer.replaceChildren() // Kartan kan skapas om i samma lager, och då ska den förra kartans pilar inte ligga kvar.

  function isOnScreen(item, width, height, bounds) {
    if (!bounds.contains(item.lngLat)) return false
    const { x, y } = map.project(item.lngLat)
    return x >= 0 && x <= width && y >= 0 && y <= height
  }

  function draw() {
    const { width, height } = map.getContainer().getBoundingClientRect()
    const bounds = map.getBounds()
    const center = map.getCenter()
    const nearest =
      me && getKommun() === me.kommun
        ? items
            .filter((item) => item.exact && item.kommun === me.kommun && !isOnScreen(item, width, height, bounds))
            .map((item) => ({ item, km: kmBetween(me.lngLat, item.lngLat) }))
            .sort((a, b) => a.km - b.km)
            .slice(0, MAX_ARROWS)
        : []

    const keys = new Set(nearest.map(({ item }) => `${item.type}:${item.id}`))
    for (const [key, el] of shown) {
      if (!keys.has(key)) {
        el.remove()
        shown.delete(key)
      }
    }

    const levels = layer.parentElement.querySelector('.map-levels')?.getBoundingClientRect()
    const origin = layer.getBoundingClientRect()
    const placed = []
    for (const { item, km } of nearest) {
      const key = `${item.type}:${item.id}`
      let el = shown.get(key)
      if (!el) {
        el = arrowEl(item, onPick)
        shown.set(key, el)
        layer.append(el)
      }
      el.lastChild.textContent = distanceText(km)
      el.title = `${item.name}, ${distanceText(km)} bort`
      el.setAttribute('aria-label', el.title)

      // Riktningen på skärmen (kartan vrids aldrig, så norr är alltid uppåt), och
      // där den linjen från skärmens mitt når den tillåtna rutan.
      const dx = (item.lngLat[0] - center.lng) * Math.cos((center.lat * Math.PI) / 180)
      const dy = -(item.lngLat[1] - center.lat) * TILT_SQUEEZE
      el.firstChild.style.transform = `rotate(${(Math.atan2(dx, -dy) * 180) / Math.PI}deg)`
      const halfWidth = Math.max(10, width / 2 - EDGE.right)
      const halfHeight = Math.max(10, height / 2 - EDGE.top)
      const scale = Math.min(halfWidth / Math.abs(dx || 1e-9), halfHeight / Math.abs(dy || 1e-9))
      let x = width / 2 + dx * scale
      let y = height / 2 + dy * scale

      // Inte under nivåknapparna uppe till höger, och inte ovanpå de andra pilarna.
      const box = el.getBoundingClientRect()
      const at = (cx, cy) => ({
        left: cx - box.width / 2,
        right: cx + box.width / 2,
        top: cy - box.height / 2,
        bottom: cy + box.height / 2,
      })
      if (levels) {
        const area = {
          left: levels.left - origin.left,
          right: levels.right - origin.left,
          top: levels.top - origin.top,
          bottom: levels.bottom - origin.top,
        }
        if (overlap(at(x, y), area)) x = area.left - box.width / 2 - GAP_PX
      }
      for (let tries = 0; tries < MAX_ARROWS && placed.some((other) => overlap(at(x, y), other)); tries++) {
        y += y < height / 2 ? box.height + GAP_PX : -(box.height + GAP_PX)
      }
      placed.push(at(x, y))
      el.style.left = `${x - box.width / 2}px`
      el.style.top = `${y - box.height / 2}px`
    }
  }

  map.on('move', draw)
  map.on('moveend', draw)
  map.on('resize', draw)

  return {
    setItems(next) {
      items = next
      draw()
    },
    setPosition(lngLat, kommun) {
      me = { lngLat, kommun }
      draw()
    },
  }
}
