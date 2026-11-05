import plusIcon from '../assets/plus.png'
import { FIGURE_HEIGHT_PX } from './doodles'

// PROTOTYP: post-it-lappar med information om platser på kartan (ikonerna i
// lagret "places"). Lapparna ligger platt och rakt ovanpå kartan, alltid lika
// stora, strax ovanför sin plats, och följer med när kartan rör sig (som
// blocken, se MapPad: lutande lappar var tröttsamma att läsa).
//   Hovra: en förhandslapp med det kartdatan har (namn och typ).
//   Klicka: lappen klistras fast och mer hämtas från OpenStreetMap
//   (öppettider, adress, telefon, webbplats). Saknas det står ett tips om vad
//   man kan göra där (TIPS) i stället. Den fastklistrade lappen har knappen
//   "Skapa event" (`onCreateEvent`, se attachPlaceNotes), med platsen och ett
//   intresse som passar (INTERESTS). En lapp i taget sitter fast: klickar man
//   på en annan plats tas den förra bort. Krysset på lappen tar bort den.
// Hovrar man lyfts också figuren lite från pappret (feature-state "hover",
// som skyltarna i map/signs.js läser).
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

// Vad man kan göra på platsen, när OpenStreetMap inte har några uppgifter om den. Skrivet som ett tips, inte som
// uppgifter om just den platsen (som att den har wifi), eftersom det gäller alla platser av samma sort.
const TIPS = {
  pitch: 'Passar för en match eller en träning tillsammans.',
  sports_centre: 'Träna inomhus, oavsett väder.',
  swimming_pool: 'Simma några längder ihop, eller ha en badträff.',
  ice_rink: 'Åk skridskor ihop eller se en match.',
  climbing: 'Klättra tillsammans, en bra start för nya vänner.',
  judo: 'Träna kampsport tillsammans.',
  stadium: 'Se en match tillsammans.',
  golf: 'Spela en runda ihop.',
  cafe: 'Bra för en fika eller en första träff.',
  restaurant: 'Ät en middag ihop.',
  fast_food: 'Snabb lunch före eller efter en aktivitet.',
  beer: 'Ta en öl ihop efter jobbet.',
  bar: 'Ta ett glas ihop en kväll.',
  ice_cream: 'Ta en glass ihop en varm dag.',
  bakery: 'Köp med fikabröd till nästa träff.',
  library: 'Lugnt ställe för en bokcirkel eller en studieträff.',
  museum: 'Gå på en utställning tillsammans.',
  art_gallery: 'Titta på konst tillsammans.',
  theatre: 'Se en föreställning tillsammans.',
  cinema: 'Se en film ihop.',
  music: 'Lyssna på musik eller spela tillsammans.',
  park: 'Bra för en promenad eller en picknick.',
  picnic_site: 'Ta med fika och sitt ute tillsammans.',
  garden: 'Promenera bland växterna i lugn och ro.',
  swimming: 'Ta ett dopp tillsammans när det är varmt.',
  playground: 'En samlingsplats för föräldrar och barn.',
}

// Intresset (namnet i intressebiblioteket) som passar platsen, förvalt när man skapar ett event där. Först efter
// plan, typ+undertyp och typ; platser utan ett tydligt intresse (t.ex. en sporthall) har inget.
const PITCH_INTERESTS = {
  soccer: 'Fotboll',
  bandy: 'Bandy',
  archery: 'Bågskytte',
  tennis: 'Tennis',
  basketball: 'Basket',
  ice_hockey: 'Ishockey',
  handball: 'Handboll',
  padel: 'Padel',
  boules: 'Boule',
  athletics: 'Friidrott',
}

const INTERESTS = {
  'art_gallery/artwork': 'Konstutställningar',
  'attraction/viewpoint': 'Fotografering',
  swimming_pool: 'Simning',
  ice_rink: 'Skridskor',
  climbing: 'Klättring',
  judo: 'Judo',
  golf: 'Golf',
  cafe: 'Fika',
  restaurant: 'Restaurangbesök',
  beer: 'Öl',
  ice_cream: 'Fika',
  bakery: 'Fika',
  library: 'Bokcirkel',
  museum: 'Museer',
  art_gallery: 'Konstutställningar',
  theatre: 'Teater',
  music: 'Musik',
  park: 'Promenader',
  picnic_site: 'Friluftsliv',
  garden: 'Trädgård',
  swimming: 'Simning',
}

function typeLabel(props) {
  if (props.class === 'pitch') return PITCH_LABELS[props.subclass] ?? TYPE_LABELS.pitch
  return SUBTYPE_LABELS[`${props.class}/${props.subclass}`] ?? TYPE_LABELS[props.class] ?? 'Plats'
}

function tipText(props) {
  return TIPS[props.class] ?? 'Ett ställe att träffas på.'
}

function interestName(props) {
  if (props.class === 'pitch') return PITCH_INTERESTS[props.subclass] ?? null
  return INTERESTS[`${props.class}/${props.subclass}`] ?? INTERESTS[props.class] ?? null
}

// Gatuadressen ur OpenStreetMaps uppgifter ("Storgatan 3"), eller ''.
function streetAddress(details) {
  return [details?.['addr:street'], details?.['addr:housenumber']].filter(Boolean).join(' ')
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
    note.append(el('p', 'map-note-tip', tipText(props)))
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
  const street = streetAddress(details)
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

  // Utan uppgifter: tipset om vad man kan göra där, i stället för en tom lapp.
  if (rows.childElementCount > 0) {
    note.append(rows)
    note.append(el('p', 'map-note-source', 'Från OpenStreetMap, kan vara inaktuellt.'))
  } else {
    note.append(el('p', 'map-note-tip', tipText(props)))
  }
  return note
}

// --- Lappens hörn på kartan ---

// Luft i pixlar mellan lappens nedre kant och platsen: lite mer än
// pop-up-figuren är hög, så att lappen inte täcker den.
const NOTE_GAP_PX = FIGURE_HEIGHT_PX + 6

// En lapp på kartan, platt och rak, med nedre kantens mitt strax ovanför
// platsen. `onClose` anropas när man klickar på krysset.
function createNote(map, layer, feature, onClose) {
  const element = el('div', 'map-note-stuck')
  layer.append(element)
  const place = feature.geometry.coordinates

  element.addEventListener('click', (event) => {
    if (event.target.closest('.map-note-close')) {
      event.stopPropagation()
      onClose?.()
    }
  })

  function position() {
    // Hela pixlar, annars kan texten bli suddig.
    const { x, y } = map.project(place)
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - NOTE_GAP_PX)}px) translate(-50%, -100%)`
    // Närmare lappar (längre ned på skärmen) ovanpå lappar längre bort.
    element.style.zIndex = Math.round(y)
  }

  function setContent(content) {
    element.replaceChildren(content)
    position()
  }

  return { element, setContent, update: position, remove: () => element.remove() }
}

// Kopplar lapparna till ett symbollager. `layer` är elementet lapparna läggs i.
// `onCreateEvent({ name, address, lngLat, interest })`: knappen "Skapa event"
// på en fastklistrad lapp (platsens namn, gatuadressen om den finns, läget som
// [lng, lat] och namnet på ett intresse som passar, eller null).
// Returnerar { showSearchNote }: en lapp för det man sökte fram i sökrutan.
export function attachPlaceNotes(map, layerId, layer, { onCreateEvent } = {}) {
  let preview = null // förhandslappen när man hovrar
  let previewId = null
  const stuck = new Map() // id -> fastklistrad lapp (högst en, se klicket nedan)
  let searchNote = null // lappen för det senaste man sökte fram (se showSearchNote)

  map.on('move', () => {
    preview?.update()
    for (const note of stuck.values()) note.update()
    searchNote?.update()
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
    // Förhandslappen bara med en muspekare. På en pekskärm skickar telefonen en musrörelse före trycket, och när
    // sidan ändras av den (förhandslappen visas) stoppar iPhone själva trycket: då kom den riktiga lappen, med
    // Skapa event, först vid andra trycket.
    if (!window.matchMedia('(hover: hover)').matches) return
    if (stuck.has(feature.id) || previewId === feature.id) return
    removePreview()
    previewId = feature.id
    preview = createNote(map, layer, feature)
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
    // En lapp i taget: den som satt fast tas bort.
    for (const other of stuck.values()) other.remove()
    stuck.clear()

    const note = createNote(map, layer, feature, () => {
      note.remove()
      stuck.delete(id)
    })
    stuck.set(id, note)

    function render(details) {
      const props = feature.properties
      const content = noteContent(props, details)
      const close = el('button', 'map-note-close', '×')
      close.type = 'button'
      close.setAttribute('aria-label', 'Ta bort lappen')
      content.prepend(close)
      if (onCreateEvent) {
        // Samma knapp som "+ Skapa event" på eventsidan (shared/CreateButton.jsx), med det handritade plusset.
        const create = el('button', 'primary-button create-button map-note-create')
        create.type = 'button'
        const plus = el('img')
        plus.src = plusIcon
        plus.alt = ''
        create.append(plus, 'Skapa event')
        create.addEventListener('click', (event) => {
          event.stopPropagation()
          onCreateEvent({
            name: props.name ?? typeLabel(props),
            address: details && details !== 'loading' ? streetAddress(details) : '',
            lngLat: feature.geometry.coordinates,
            interest: interestName(props),
          })
        })
        content.append(create)
      }
      note.setContent(content)
    }

    render('loading')
    fetchDetails(id).then((details) => {
      if (stuck.get(id) === note) render(details)
    })
  })

  // Sökrutan (SCRUM-220, se MapPlaceSearch): en lapp vid platsen man sökte fram,
  // med namnet och vad det är ("Värmdö kommun, Stockholms län"). En ny sökning
  // byter ut den, och krysset tar bort den.
  function showSearchNote({ name, sub, lngLat }) {
    searchNote?.remove()
    const note = createNote(map, layer, { geometry: { coordinates: lngLat } }, () => {
      note.remove()
      if (searchNote === note) searchNote = null
    })
    searchNote = note
    const content = el('div', 'map-note')
    const close = el('button', 'map-note-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Ta bort lappen')
    content.append(close, el('p', 'map-note-title', name))
    if (sub) content.append(el('p', 'map-note-type', sub))
    note.setContent(content)
  }

  return { showSearchNote }
}
