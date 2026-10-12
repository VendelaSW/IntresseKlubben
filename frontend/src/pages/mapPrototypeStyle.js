// PROTOTYP, steg 2: egen kartstil, "skattkarta ritad på ett gult block".
// Samma data som innan (OpenFreeMap, OpenMapTiles-schemat).
//
// Kartan har ingen egen bakgrund: själva blocket (gult papper med linjer)
// ligger i CSS bakom kartan, och kartan ritas genomskinligt ovanpå. Allt som
// syns ska se ut som penna och färgpenna: vatten är blå snedstreck, skog är
// ifylld med grön kant och får små granar när man zoomar in (mönster och
// granar ritas i mapPrototypeDoodles.js), vägar är blyertsstreck och små
// vägar streckade som stigar på en skattkarta.
//
// Ortnamnen ritas inte här (MapLibre kan inte använda Caveat direkt). Lagret
// "place-anchors" är osynligt och används bara för att ta reda på var
// namnen får plats; själva texten läggs ovanpå i HTML, se MapPrototype.jsx.
//
// Utanför Sverige är pappret tomt: blocket läggs över kartan där, med Sverige
// urklippt (se attachOutsidePaper i MapPrototype.jsx). Här ritas bara gränsen.

import lan from './mapPrototypeLan.json'
import sweden from './mapPrototypeSweden.json'

// Sveriges kontur (fastlandet och de stora öarna) ur mapPrototypeSweden.json,
// byggd från perliedman/svenska-landskap (CC0, Lantmäteriets Distriktskarta).
// Konturen går en bit ut i havet, så kusten ritas av kartan som vanligt.
export const SWEDEN_OUTLINE = sweden.features.find((f) => f.properties.kind === 'outline').geometry

// Sveriges kontur som ringar av [longitud, latitud] (fastlandet och öarna).
export const SWEDEN_RINGS = SWEDEN_OUTLINE.coordinates.map((polygon) => polygon[0])

// Ligger punkten innanför Sveriges gräns? (Strålmetoden.)
export function inSweden(lng, lat) {
  let inside = false
  for (const ring of SWEDEN_RINGS) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

// Sveriges gräns, som en linje ovanpå kartan.
const SWEDEN_BORDER = { type: 'Feature', properties: {}, geometry: SWEDEN_OUTLINE }

// Landskapens namn: en punkt mitt i varje landskap, med namn och yta (km²).
// Ritas i HTML ovanpå kartan, som ortnamnen (se MapPrototype.jsx).
export const LANDSKAP_LABELS = sweden.features
  .filter((f) => f.properties.kind === 'label')
  .map((f) => ({ id: f.properties.kod, name: f.properties.namn, lngLat: f.geometry.coordinates, km2: f.properties.km2 }))

// Landskapens ytor, för färgfyllning. `farg` (0-3) är vald så att grannar
// aldrig får samma färg.
export const LANDSKAP_AREAS = {
  type: 'FeatureCollection',
  features: sweden.features.filter((f) => f.properties.kind === 'area'),
}
// Bleka färgpennor, som på en gammal skolkarta. Ingen gul, den försvinner
// mot det gula pappret.
const LANDSKAP_COLOURS = ['#e8a99a', '#a9c98a', '#9fbfdc', '#c7a8d6']

// Länen (från SCB:s Digitala gränser, CC0), för landskapsvyn: där syns
// landskapet uppdelat i de län det ligger i, som Sverige i landskap.
export const LAN_AREAS = { type: 'FeatureCollection', features: lan.features.filter((f) => f.properties.kind === 'lan') }
// Namnpunkter: en per del av ett län som ligger i ett landskap.
export const LAN_LABELS = lan.features
  .filter((f) => f.properties.kind === 'lanlabel')
  .map((f) => ({
    landskap: f.properties.landskap,
    id: f.properties.kod,
    name: f.properties.namn,
    km2: f.properties.km2,
    lngLat: f.geometry.coordinates,
  }))
const colourByFarg = (colours) => ['match', ['get', 'farg'], 0, colours[0], 1, colours[1], 2, colours[2], colours[3]]

// Gränserna mellan landskapen, som linjer.
const LANDSKAP_BORDERS = {
  type: 'FeatureCollection',
  features: sweden.features.filter((f) => f.properties.kind === 'border'),
}
const PENCIL = '#4a3f35'
const BORDER_INK = '#9c4a2f' // rödbrun färgpenna för landskapsgränser
const PENCIL_LIGHT = 'rgba(74, 63, 53, 0.55)'
const WATER_INK = '#2f5f9e'
const FOREST = '#8fb36b' // grön färgpenna
const FOREST_INK = '#2f6b3a'

const MAJOR_ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']
const MINOR_ROADS = ['minor', 'service']
// Platser där en klubb kan träffas, i grupper med en klotterikon var
// (place-<grupp> i mapPrototypeDoodles.js). Kartdatans "class" avgör gruppen.
const SPORT = ['pitch', 'sports_centre', 'swimming_pool', 'ice_rink', 'climbing', 'judo', 'stadium', 'golf']
const FIKA = ['cafe', 'restaurant', 'fast_food', 'beer', 'bar', 'ice_cream', 'bakery']
const CULTURE = ['library', 'museum', 'art_gallery', 'theatre', 'cinema', 'music']
const NATURE = ['park', 'picnic_site', 'garden', 'swimming']
// Privata pooler och trädgårdar finns i mängder i datan, nästan alltid utan
// namn. De här typerna tas bara med om de har ett namn.
const NAMED_ONLY = ['swimming_pool', 'garden']

// Vilken grupp en plats hör till, eller '' om den inte ska synas.
const PLACE_GROUP = [
  'case',
  ['all', ['in', ['get', 'class'], ['literal', NAMED_ONLY]], ['!', ['has', 'name']]], '',
  ['all', ['==', ['get', 'class'], 'town_hall'], ['==', ['get', 'subclass'], 'community_centre']], 'meet',
  ['all', ['==', ['get', 'class'], 'attraction'], ['==', ['get', 'subclass'], 'viewpoint']], 'nature',
  [
    'match',
    ['get', 'class'],
    SPORT, 'sport',
    FIKA, 'fika',
    CULTURE, 'culture',
    NATURE, 'nature',
    'playground', 'play',
    '',
  ],
]
// Samma regel som PLACE_GROUP, men i JavaScript, för skyltarna som ritas
// ovanpå kartan (se mapPrototypeSigns.js).
export function placeGroup({ class: type, subclass, name }) {
  if (NAMED_ONLY.includes(type) && !name) return ''
  if (type === 'town_hall' && subclass === 'community_centre') return 'meet'
  if (type === 'attraction' && subclass === 'viewpoint') return 'nature'
  if (SPORT.includes(type)) return 'sport'
  if (FIKA.includes(type)) return 'fika'
  if (CULTURE.includes(type)) return 'culture'
  if (NATURE.includes(type)) return 'nature'
  if (type === 'playground') return 'play'
  return ''
}

// Om två ikoner krockar vinner den grupp som står först. Lekplatser sist,
// eftersom de är så många.
const GROUP_PRIORITY = ['meet', 'culture', 'fika', 'sport', 'nature', 'play']

// Bredd som växer med zoomen: [zoom, bredd i pixlar], ...
function widthByZoom(...stops) {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()]
}

const mapStyle = {
  version: 8,
  sources: {
    // Bara kartrutor inom Sverige hämtas (Strömstad till Haparanda, Smygehuk
    // till Treriksröset). Utanför är det tomt papper, och inget laddas därifrån.
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      bounds: [10.9, 55.3, 24.2, 69.1],
    },
    sweden: { type: 'geojson', data: SWEDEN_BORDER },
    landskap: { type: 'geojson', data: LANDSKAP_BORDERS },
    // promoteId: landskapskoden blir id, så att hovring kan markeras (feature-state).
    'landskap-areas': { type: 'geojson', data: LANDSKAP_AREAS, promoteId: 'kod' },
    'lan-areas': { type: 'geojson', data: LAN_AREAS, promoteId: 'kod' },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    // Genomskinlig bakgrund, så att blocket i CSS syns igenom.
    { id: 'paper', type: 'background', paint: { 'background-opacity': 0 } },

    // --- Landskapen ifyllda med färgpenna ---
    // Underst, så att vatten och skog ritas ovanpå. Tydligast utzoomat och
    // borta när man har zoomat in, så att den detaljerade kartan inte färgas.
    // Länen i landskapsvyn (dolda annars, se setMode i MapPrototype.jsx).
    {
      id: 'lan-fill',
      type: 'fill',
      source: 'lan-areas',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': colourByFarg(LANDSKAP_COLOURS),
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.7, 0.42],
      },
    },
    {
      id: 'landskap-fill',
      type: 'fill',
      source: 'landskap-areas',
      paint: {
        'fill-color': ['match', ['get', 'farg'], 0, LANDSKAP_COLOURS[0], 1, LANDSKAP_COLOURS[1], 2, LANDSKAP_COLOURS[2], LANDSKAP_COLOURS[3]],
        // Landskapet under musen blir lite starkare (går att klicka på, se
        // MapPrototype.jsx).
        'fill-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          ['case', ['boolean', ['feature-state', 'hover'], false], 0.75, 0.45],
          8,
          ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0.35],
          10,
          0,
        ],
      },
    },

    // --- Skog ---
    // Utzoomat: ifylld med färgpenna och en tydlig kant. Inzoomat: färgen
    // bleknar och små grupper av granar tar över (se forest-pines nedan).
    {
      id: 'forest',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'fill-color': FOREST,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.75, 14, 0.3, 16, 0.15],
      },
    },
    {
      id: 'forest-edge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': FOREST_INK,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 15, 1.6],
        'line-opacity': 0.8,
      },
    },

    // --- Vatten: blå snedstreck och en bläckad strandlinje ---
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-pattern': 'water-hatch' },
    },
    {
      id: 'shoreline',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'water',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': WATER_INK, 'line-width': widthByZoom([10, 0.8], [16, 2.2]) },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': WATER_INK, 'line-width': widthByZoom([10, 0.6], [16, 1.8]) },
    },

    // --- Vägar: små vägar som streckade stigar, större som blyertsstreck ---
    {
      id: 'roads-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['in', ['get', 'class'], ['literal', MINOR_ROADS]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': PENCIL_LIGHT,
        'line-width': widthByZoom([13, 0.8], [17, 2]),
        'line-dasharray': [3, 2.5],
      },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', MAJOR_ROADS]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': PENCIL, 'line-width': widthByZoom([8, 0.8], [12, 1.6], [17, 4]) },
    },

    // --- Byggnader ---
    // Osynligt: bara husens form och höjd. Själva husen ritas skissade i 3D
    // på en egen canvas ovanpå kartan (se mapPrototypeBuildings.js), eftersom
    // kartans egna 3D-hus inte kan få bläcklinjer längs kanterna.
    {
      id: 'building-shapes',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-opacity': 0 },
    },

    // --- Granar, bara inzoomat ---
    // Symboler i stället för mönster: de har samma storlek på skärmen hela
    // tiden. Grupperna ställs längs skogens kant (så att man ser var skogen
    // börjar) och en grupp inne i varje skogsområde. De som inte får plats
    // utan att krocka hoppas över, så tätheten sköter sig själv.
    {
      id: 'forest-pines-edge',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      minzoom: 13.5,
      filter: ['==', ['get', 'class'], 'wood'],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 70,
        'icon-image': 'pine-group',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13.5, 0.75, 16, 1],
        // Granarna ska alltid stå upp, inte luta med kanten.
        'icon-rotation-alignment': 'viewport',
        // Mitt på kanten, annars står granarna utanför skogen på norrsidan.
        'icon-anchor': 'center',
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14, 1] },
    },
    {
      id: 'forest-pines-inner',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      minzoom: 13.5,
      filter: ['==', ['get', 'class'], 'wood'],
      layout: {
        'icon-image': 'pine-group',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13.5, 0.75, 16, 1],
        'icon-anchor': 'bottom',
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14, 1] },
    },

    // --- Landskapsgränser ---
    // Rödbrun färgpenna, streck-prick som gränser på gamla kartor, så att de
    // inte förväxlas med vägarna (grafit). Tydligast utzoomat; de bleknar
    // inzoomat, där de annars skär rakt genom gator och hus.
    {
      id: 'landskap-borders',
      type: 'line',
      source: 'landskap',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': BORDER_INK,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2.2, 12, 2.6],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 10, 0.75, 12, 0.45, 14, 0],
        'line-dasharray': [4, 1.6, 0.4, 1.6],
      },
    },

    // Gränserna mellan länen i landskapsvyn, i samma stil som landskapens.
    {
      id: 'lan-borders',
      type: 'line',
      source: 'lan-areas',
      layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': BORDER_INK,
        'line-width': 2,
        'line-opacity': 0.75,
        'line-dasharray': [4, 1.6, 0.4, 1.6],
      },
    },

    // --- Sveriges gräns ---
    // Utanför gränsen läggs blocket över kartan (se attachOutsidePaper i
    // MapPrototype.jsx). Platser och ortnamn utanför Sverige filtreras bort i
    // sina egna lager nedan.
    {
      id: 'sweden-edge',
      type: 'line',
      source: 'sweden',
      paint: { 'line-color': PENCIL_LIGHT, 'line-width': 1.2, 'line-dasharray': [3, 2] },
    },

    // --- Platser där en klubb kan träffas: pop-up-figurer ---
    // Bara inzoomat. En figur per grupp (se PLACE_GROUP överst). Ikonerna här
    // är osynliga: kartan använder dem för att bestämma vilka platser som får
    // plats utan att krocka, och för hovring och klick. Själva figurerna ritas
    // stående i perspektiv ovanpå kartan (se mapPrototypeSigns.js).
    {
      id: 'places',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 14,
      filter: ['all', ['!=', PLACE_GROUP, ''], ['within', SWEDEN_OUTLINE]],
      layout: {
        'icon-image': ['concat', 'place-', PLACE_GROUP],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.75, 17, 1],
        'symbol-sort-key': ['index-of', PLACE_GROUP, ['literal', GROUP_PRIORITY]],
        'icon-anchor': 'bottom',
        'icon-padding': 4,
      },
      paint: { 'icon-opacity': 0 },
    },

    // --- Osynligt: var ortnamnen får plats (texten läggs på i HTML) ---
    {
      id: 'place-anchors',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb']]],
        ['within', SWEDEN_OUTLINE],
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        // Ungefär lika stor yta som Caveat-texten tar, så att namnen inte
        // krockar med varandra.
        'text-size': ['match', ['get', 'class'], ['city', 'town'], 22, 16],
        'text-padding': 8,
      },
      paint: { 'text-opacity': 0 },
    },
  ],
}

export default mapStyle
