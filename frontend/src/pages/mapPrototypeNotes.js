import { Popup } from 'maplibre-gl'

// PROTOTYP: post-it-lapp med information om en plats på kartan (ikonerna i
// lagret "places"). Hovra: lappen visar det kartdatan har (namn och typ).
// Klicka: lappen sitter kvar och mer hämtas från OpenStreetMap (öppettider,
// adress, telefon, webbplats). Uppgifterna kan vara inaktuella - de kommer
// från frivilliga - så det står på lappen.
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

// Kopplar lappen till ett symbollager. Hovra visar, klick fäster och hämtar
// mer, klick någon annanstans (eller krysset) stänger.
export function attachPlaceNotes(map, layerId) {
  const popup = new Popup({
    className: 'map-note-popup',
    closeButton: false,
    closeOnClick: false,
    offset: 20,
    maxWidth: '260px',
  })
  let pinnedId = null

  function show(feature, details) {
    popup.setLngLat(feature.geometry.coordinates).setDOMContent(noteContent(feature.properties, details))
    if (!popup.isOpen()) popup.addTo(map)
  }

  map.on('mouseenter', layerId, (e) => {
    map.getCanvas().style.cursor = 'pointer'
    if (pinnedId === null) show(e.features[0])
  })
  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = ''
    if (pinnedId === null) popup.remove()
  })

  map.on('click', (e) => {
    const feature = map.queryRenderedFeatures(e.point, { layers: [layerId] })[0]
    if (!feature) {
      pinnedId = null
      popup.remove()
      return
    }
    const id = feature.id
    pinnedId = id
    show(feature, 'loading')
    fetchDetails(id).then((details) => {
      // Bara om lappen fortfarande gäller samma plats.
      if (pinnedId === id) show(feature, details)
    })
  })
}
