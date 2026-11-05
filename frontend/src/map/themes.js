// TILLFÄLLIGT (testläget): kartans utseende att jämföra, en väljare i testpanelen för varje del, som går att blanda
// fritt. Papperet är alltid samma som på startsidan. Förvalet ("pre-dev") i varje väljare är kartan som den ser ut nu.
// Tas bort när utseendet är valt: då blir valen de vanliga färgerna.

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (values) => `#${values.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const rgba = (hex, alpha) => `rgba(${channels(hex).join(', ')}, ${alpha})`
// Färgen `a` med andelen `share` av färgen `b`.
const mix = (a, b, share) => {
  const second = channels(b)
  return toHex(channels(a).map((v, i) => v + (second[i] - v) * share))
}

const PAPER = '#f7f1e3'
const DARK = '#4a3f35'

// Väggfärger till en uppsättning: taket ljusare mot papperet och skuggsidan mörkare.
const houses = (...walls) => walls.map((wall) => ({ roof: mix(wall, PAPER, 0.6), lit: wall, dark: mix(wall, DARK, 0.16) }))

const LINES = [
  { id: 'pre-dev', label: 'Blå, som nu', line: 'rgba(80, 140, 200, 0.35)', gridLine: 'transparent', gap: '32px' },
  { id: 'startsidan', label: 'Som på startsidan', line: 'rgba(191, 215, 237, 0.75)', gridLine: 'transparent', gap: '35px' },
  { id: 'varma', label: 'Varmt beige', line: 'rgba(170, 130, 80, 0.3)', gridLine: 'transparent', gap: '32px' },
  { id: 'gra', label: 'Svagt gråa', line: 'rgba(90, 90, 90, 0.14)', gridLine: 'transparent', gap: '32px' },
  { id: 'rutor', label: 'Rutat', line: 'rgba(80, 140, 200, 0.26)', gridLine: 'rgba(80, 140, 200, 0.26)', gap: '26px' },
  { id: 'millimeter', label: 'Millimeterpapper', line: 'rgba(214, 120, 70, 0.26)', gridLine: 'rgba(214, 120, 70, 0.26)', gap: '14px' },
  { id: 'inga', label: 'Inga linjer', line: 'transparent', gridLine: 'transparent', gap: '32px' },
  { id: 'gron', label: 'Grönt block', line: 'rgba(90, 160, 110, 0.3)', gridLine: 'transparent', gap: '32px' },
  { id: 'rosa', label: 'Rosa', line: 'rgba(220, 120, 140, 0.26)', gridLine: 'transparent', gap: '32px' },
  { id: 'tata', label: 'Täta blå', line: 'rgba(80, 140, 200, 0.28)', gridLine: 'transparent', gap: '18px' },
  { id: 'glesa', label: 'Glesa blå', line: 'rgba(80, 140, 200, 0.35)', gridLine: 'transparent', gap: '56px' },
  { id: 'stora-rutor', label: 'Stora rutor', line: 'rgba(120, 120, 120, 0.16)', gridLine: 'rgba(120, 120, 120, 0.16)', gap: '56px' },
]

const MARGINS = [
  { id: 'pre-dev', label: 'Röd, som nu', margin: 'rgba(214, 69, 65, 0.55)' },
  { id: 'rosa', label: 'Rosa', margin: 'rgba(231, 161, 161, 0.8)' },
  { id: 'beige', label: 'Beige', margin: 'rgba(170, 130, 80, 0.45)' },
  { id: 'ingen', label: 'Ingen', margin: 'transparent' },
  { id: 'bla', label: 'Blå', margin: 'rgba(60, 110, 190, 0.5)' },
  { id: 'gron', label: 'Grön', margin: 'rgba(70, 140, 90, 0.5)' },
]

const GLOWS = [
  { id: 'pre-dev', label: 'Bärnsten, som nu', glow: 'rgba(190, 120, 40, 0.28)', glowTop: 'rgba(230, 160, 60, 0.12)' },
  { id: 'svag', label: 'Svag', glow: 'rgba(190, 120, 40, 0.12)', glowTop: 'rgba(230, 160, 60, 0.04)' },
  { id: 'lampa', label: 'Under en lampa, mörkare', glow: 'rgba(70, 45, 20, 0.3)', glowTop: 'rgba(70, 45, 20, 0.1)' },
  { id: 'ingen', label: 'Ingen', glow: 'transparent', glowTop: 'transparent' },
  { id: 'rosa', label: 'Rosa solnedgång', glow: 'rgba(230, 110, 110, 0.26)', glowTop: 'rgba(240, 150, 90, 0.14)' },
  { id: 'gron', label: 'Grönt skogsljus', glow: 'rgba(80, 130, 70, 0.22)', glowTop: 'rgba(120, 170, 90, 0.08)' },
  { id: 'skymning', label: 'Blå skymning', glow: 'rgba(60, 70, 130, 0.26)', glowTop: 'rgba(60, 70, 130, 0.1)' },
]

// Pennan: vägarna, gränserna och konturerna på husen.
const PENCILS = [
  { id: 'pre-dev', label: 'Brun, som nu', pencil: '#4a3f35', border: '#9c4a2f', ink: 'rgba(58, 42, 28, 0.88)', graphite: '84, 58, 36' },
  { id: 'gra', label: 'Grå blyerts', pencil: '#55534f', border: '#6b6a66', ink: 'rgba(40, 38, 35, 0.85)', graphite: '55, 53, 50' },
  { id: 'svart', label: 'Svart tusch', pencil: '#1c1b1a', border: '#1c1b1a', ink: 'rgba(20, 19, 18, 0.95)', graphite: '25, 24, 23' },
  { id: 'marin', label: 'Marinblå kulspets', pencil: '#23395b', border: '#23395b', ink: 'rgba(28, 44, 72, 0.9)', graphite: '35, 57, 91' },
  { id: 'rost', label: 'Rostbrun', pencil: '#7a3e1d', border: '#a8481c', ink: 'rgba(100, 50, 22, 0.9)', graphite: '122, 62, 29' },
  { id: 'gron', label: 'Mörkgrön', pencil: '#2f4a38', border: '#2f4a38', ink: 'rgba(38, 60, 46, 0.9)', graphite: '47, 74, 56' },
  { id: 'plommon', label: 'Plommon', pencil: '#4f2c4f', border: '#7c3f7c', ink: 'rgba(70, 38, 70, 0.9)', graphite: '79, 44, 79' },
  { id: 'rod', label: 'Röd rättpenna', pencil: '#8f2d2a', border: '#b5302b', ink: 'rgba(120, 36, 32, 0.9)', graphite: '143, 45, 42' },
]

const WATERS = [
  { id: 'pre-dev', label: 'Blå, som nu', water: '#2f5f9e', waterHatch: 'rgba(52, 110, 190, 0.55)' },
  { id: 'turkos', label: 'Turkos', water: '#1f8a92', waterHatch: rgba('#1f8a92', 0.55) },
  { id: 'ljus', label: 'Ljusblå', water: '#6aa5d4', waterHatch: rgba('#6aa5d4', 0.6) },
  { id: 'marin', label: 'Marinblå', water: '#1d3f6b', waterHatch: rgba('#1d3f6b', 0.55) },
  { id: 'gra', label: 'Gråblå', water: '#66788a', waterHatch: rgba('#66788a', 0.55) },
  { id: 'lila', label: 'Lila', water: '#6a55a8', waterHatch: rgba('#6a55a8', 0.5) },
  { id: 'kobolt', label: 'Stark kobolt', water: '#1f49c4', waterHatch: rgba('#1f49c4', 0.65) },
]

const forest = (forestColor, ink) => ({ forest: forestColor, forestInk: ink, pine: rgba(ink, 0.9) })
const FORESTS = [
  { id: 'pre-dev', label: 'Grön, som nu', ...forest('#8fb36b', '#2f6b3a'), pine: 'rgba(30, 80, 40, 0.9)' },
  { id: 'solig', label: 'Solig grön', ...forest('#a5c95e', '#4f7a22') },
  { id: 'oliv', label: 'Oliv', ...forest('#a9a968', '#5d5e27') },
  { id: 'salvia', label: 'Salvia', ...forest('#a9c2a0', '#4c6b52') },
  { id: 'mork', label: 'Mörk skog', ...forest('#6f9a68', '#23502f') },
  { id: 'host', label: 'Höst', ...forest('#d3a653', '#8a5a1c') },
  { id: 'blyerts', label: 'Bara blyerts', ...forest('#c9c8bd', '#55534f') },
  { id: 'mossa', label: 'Mossa', ...forest('#8a9a4b', '#49581c') },
  { id: 'bla-gron', label: 'Blågrön', ...forest('#7fb5a0', '#2c6a5c') },
  { id: 'rosa', label: 'Körsbärsblom', ...forest('#efb6c6', '#a55672') },
]

const REGIONS = [
  { id: 'pre-dev', label: 'Skolkarta, som nu', regions: ['#e8a99a', '#a9c98a', '#9fbfdc', '#c7a8d6'] },
  { id: 'varma', label: 'Varma', regions: ['#eeb491', '#e4cf8c', '#d9a0a0', '#c9c088'] },
  { id: 'svala', label: 'Svala', regions: ['#a9cfd8', '#b5d4b8', '#c1c7e8', '#d3c7e6'] },
  { id: 'jord', label: 'Jordtoner', regions: ['#cf9a78', '#a6ad6d', '#b8a584', '#c4a184'] },
  { id: 'starka', label: 'Starkare', regions: ['#e8846f', '#8fc265', '#6fa8d8', '#b583d0'] },
  { id: 'gra', label: 'Gråskala', regions: ['#ddd9cf', '#cfcbc0', '#e5e1d7', '#d5d1c6'] },
  { id: 'solnedgang', label: 'Solnedgång', regions: ['#f2a07b', '#f4c869', '#e58ca0', '#b98cc9'] },
  { id: 'hav', label: 'Hav och himmel', regions: ['#8ec7d8', '#a6dcc9', '#b7c9f0', '#d3e2ec'] },
]

const HOUSE_COLORS = [
  {
    id: 'pre-dev',
    label: 'Puts, som nu',
    palettes: [
      { roof: '#f8ecd2', lit: '#f3e2c0', dark: '#e2cea8' },
      { roof: '#f8e8c2', lit: '#f2d9a2', dark: '#e0c388' },
      { roof: '#f6e2d0', lit: '#ecc8ae', dark: '#d9b095' },
      { roof: '#f4dcce', lit: '#e4b9a4', dark: '#cfa08a' },
      { roof: '#eeeacb', lit: '#dcdcae', dark: '#c6c793' },
      { roof: '#f8e4da', lit: '#f0cfc2', dark: '#dcb7a9' },
    ],
  },
  { id: 'varma', label: 'Varma och starka', palettes: houses('#eed5a3', '#ecc265', '#e39f79', '#cc7b5e', '#bbbf7d', '#e6a998') },
  { id: 'falu', label: 'Falurött och vitt', palettes: houses('#f4f0e3', '#f6d569', '#b43a2c', '#a33024', '#8fb36e', '#f4f0e3') },
  { id: 'pastell', label: 'Pastell', palettes: houses('#fbf1d6', '#fbe98f', '#f8c0c9', '#c6e59c', '#b4e3e3', '#e1cdf3') },
  { id: 'tegel', label: 'Tegelstad', palettes: houses('#e6c8a8', '#d59f7a', '#c47f5e', '#a9593f', '#b58a6a', '#dcb596') },
  { id: 'tra', label: 'Trähus', palettes: houses('#e7cfa4', '#c9a06f', '#a97d50', '#8f6843', '#b9ad7a', '#d8b98d') },
  { id: 'blek', label: 'Bara grädde', palettes: houses('#f3e2c0', '#efddb6', '#f1dfbf', '#ecd9b4', '#f3e6c8', '#efdcbb') },
  { id: 'gra', label: 'Gråskala', palettes: houses('#eeece6', '#e2e0da', '#d6d4ce', '#c9c7c1', '#dddbd5', '#e8e6e0') },
  { id: 'bullerbyn', label: 'Bullerbyn', palettes: houses('#c63d30', '#c63d30', '#f0d060', '#f4f0e3', '#7da0c9', '#d97c3f') },
  { id: 'medelhav', label: 'Medelhav', palettes: houses('#f6f1e4', '#f6f1e4', '#6fa8d6', '#2f7fb5', '#f0c75e', '#e69a6f') },
  { id: 'godis', label: 'Godisfärger', palettes: houses('#ff9fb8', '#ffd25e', '#7fd6c2', '#a48cf0', '#8fd46a', '#ff9a6b') },
  { id: 'skog', label: 'Skogsstuga', palettes: houses('#8f6a44', '#6c7f4b', '#a68a5b', '#4f6b4f', '#c2a877', '#7b5a3c') },
  { id: 'hav', label: 'Båthus vid havet', palettes: houses('#f3f0e6', '#7fa8c4', '#3f6f92', '#c2d8d9', '#d9694f', '#e8ddc4') },
]

// Husens stil. `hatch` är skrafferingen (glesheten och styrkan), `wallPattern` och `roofPattern` vad som ritas på väggar
// och tak, `outline` konturen, `shadow` skuggans styrka på pappret och `palette` hur färgerna används.
const LIGHT_HATCH = { roof: [2.6, 0.2], lit: [4, 0.14], dark: [2.2, 0.22] }
const DENSE_HATCH = { roof: [1.3, 0.35], lit: [1.4, 0.4], dark: [0.7, 0.55] }
const STYLE = { hatch: null, lineWidth: 1.2, outline: 'normal', shadow: 0.16, wallPattern: null, roofPattern: null, palette: null }
const style = (id, label, options) => ({ ...STYLE, id, label, ...options })
const HOUSE_STYLES = [
  style('pre-dev', 'Puts med lätt skraffering, som nu', { hatch: LIGHT_HATCH }),
  style('fonster', 'Fönster', { wallPattern: 'windows' }),
  style('upplysta', 'Upplysta fönster', { wallPattern: 'litWindows', palette: 'deep', shadow: 0.24 }),
  style('sadeltak', 'Sadeltak', { roofPattern: 'gable' }),
  style('sadeltak-fonster', 'Sadeltak och fönster', { roofPattern: 'gable', wallPattern: 'windows' }),
  style('takpannor', 'Takpannor', { roofPattern: 'tiles', palette: 'colouredRoofs' }),
  style('tegel', 'Tegelväggar', { wallPattern: 'brick', palette: 'colouredWalls' }),
  style('liggande-panel', 'Liggande träpanel', { wallPattern: 'planks' }),
  style('staende-panel', 'Stående träpanel', { wallPattern: 'panels' }),
  style('prickat', 'Prickade tak', { roofPattern: 'dots' }),
  style('farg-tak', 'Färgade tak och ljusa väggar', { palette: 'colouredRoofs' }),
  style('ren', 'Rena ytor', {}),
  style('skiss', 'Tät blyertsskiss', { hatch: DENSE_HATCH }),
  style('kors', 'Korsskraffering', { hatch: DENSE_HATCH, wallPattern: 'crosshatch', roofPattern: 'crosshatch' }),
  style('dubbel', 'Dubbel skisslinje', { outline: 'double', lineWidth: 0.9 }),
  style('ritning', 'Streckad ritning', { outline: 'dashed', lineWidth: 1, palette: 'outlineOnly', shadow: 0 }),
  style('kontur', 'Bara konturer på papperet', { lineWidth: 1.1, palette: 'outlineOnly' }),
  style('tjock', 'Tjock bläckkontur', { lineWidth: 2.4 }),
  style('serie', 'Serietidning', { lineWidth: 2.2, wallPattern: 'windows', palette: 'deep', shadow: 0.3 }),
  style('akvarell', 'Akvarell utan konturer', { outline: 'none', shadow: 0.08 }),
  style('pappersklipp', 'Pappersklipp', { outline: 'none', shadow: 0.42, palette: 'deep' }),
]

const HOUSE_HEIGHTS = [
  { id: 'pre-dev', label: 'Som nu', heightScale: 1 },
  { id: 'laga', label: 'Låga', heightScale: 0.55 },
  { id: 'hoga', label: 'Höga', heightScale: 1.6 },
  { id: 'platta', label: 'Nästan platta', heightScale: 0.2 },
  { id: 'skyskrapor', label: 'Skyskrapor', heightScale: 2.8 },
]

// Marken: en ton över pappret, bara inom Sverige. Linjerna syns igenom, så opacity är under 1.
const ground = (id, label, color, opacity = 0.55) => ({ id, label, ground: color, groundOpacity: opacity })
const GROUNDS = [
  ground('pre-dev', 'Bara pappret, som nu', PAPER, 0),
  ground('sand', 'Sand', '#ead9ad'),
  ground('halm', 'Halm', '#efdd8f'),
  ground('gras', 'Gräs', '#c6dc9a'),
  ground('ang', 'Ljus äng', '#dde9ad', 0.65),
  ground('mint', 'Mint', '#c7e6cf'),
  ground('salvia', 'Salvia', '#cdd8bd'),
  ground('mossa', 'Mossa', '#b4bd83'),
  ground('terrakotta', 'Terrakotta', '#e8bd9b'),
  ground('persika', 'Persika', '#f5cfb5'),
  ground('rosa', 'Rosa', '#f3cfd2'),
  ground('lavendel', 'Lavendel', '#dcd2ec'),
  ground('himmel', 'Himmelsblå', '#cfe3ee'),
  ground('betong', 'Grå betong', '#d7d4cc'),
  ground('kaffe', 'Kaffe', '#d3b896'),
  ground('stark-gron', 'Stark grön', '#9ccb74', 0.75),
]

const ROADS = [
  { id: 'pre-dev', label: 'Som nu', roadScale: 1, roadDash: null, minorDash: [3, 2.5], roadColor: null },
  { id: 'tunna', label: 'Tunna', roadScale: 0.6, roadDash: null, minorDash: [3, 2.5], roadColor: null },
  { id: 'tjocka', label: 'Tjocka', roadScale: 1.9, roadDash: null, minorDash: [3, 2.5], roadColor: null },
  { id: 'streckade', label: 'Streckade, som på en skattkarta', roadScale: 1, roadDash: [3, 2], minorDash: [1, 2.5], roadColor: null },
  { id: 'hela', label: 'Hela småvägar', roadScale: 1, roadDash: null, minorDash: [1, 0], roadColor: null },
  { id: 'rod', label: 'Röd färgpenna', roadScale: 1.2, roadDash: null, minorDash: [3, 2.5], roadColor: '#b5452c' },
  { id: 'gul', label: 'Gul överstrykningspenna', roadScale: 3, roadDash: null, minorDash: [3, 2.5], roadColor: '#efc84a' },
]

const FOREST_STYLES = [
  { id: 'pre-dev', label: 'Som nu', forestScale: 1, pines: true },
  { id: 'svag', label: 'Svag färg', forestScale: 0.5, pines: true },
  { id: 'stark', label: 'Stark färg', forestScale: 1.6, pines: true },
  { id: 'utan-granar', label: 'Utan granar', forestScale: 1, pines: false },
  { id: 'bara-granar', label: 'Bara granar', forestScale: 0, pines: true },
  { id: 'ingen', label: 'Ingen skog', forestScale: 0, pines: false },
]

const WATER_STYLES = [
  { id: 'pre-dev', label: 'Snedstreck, som nu', waterPattern: 'hatch' },
  { id: 'kors', label: 'Korsstreck', waterPattern: 'cross' },
  { id: 'vagor', label: 'Vågor', waterPattern: 'waves' },
  { id: 'prickar', label: 'Prickar', waterPattern: 'dots' },
  { id: 'liggande', label: 'Liggande streck', waterPattern: 'lines' },
  { id: 'hel', label: 'Hel färg', waterPattern: 'solid' },
]

const NAMES = [
  { id: 'pre-dev', label: 'Handskrivet, som nu', names: 'pre-dev' },
  { id: 'versaler', label: 'Tryckta versaler', names: 'versaler' },
  { id: 'lapp', label: 'På små lappar', names: 'lapp' },
  { id: 'stora', label: 'Stora', names: 'stora' },
  { id: 'sma', label: 'Små', names: 'sma' },
  { id: 'bla', label: 'Blått bläck', names: 'bla' },
  { id: 'rod', label: 'Röd penna', names: 'rod' },
]

// Varje väljare i testpanelen. `attr` blir ett data-attribut på <html> (se PadBackgroundPicker och useDesignChoice).
export const MAP_PICKERS = [
  { attr: 'mapGround', key: 'testlage-karta-mark', label: 'Karta: marken', options: GROUNDS },
  { attr: 'mapLines', key: 'testlage-karta-linjer', label: 'Karta: linjer', options: LINES },
  { attr: 'mapMargin', key: 'testlage-karta-marginal', label: 'Karta: marginal', options: MARGINS },
  { attr: 'mapGlow', key: 'testlage-karta-kant', label: 'Karta: kanten runt sidan', options: GLOWS },
  { attr: 'mapPencil', key: 'testlage-karta-penna', label: 'Karta: vägar och penna', options: PENCILS },
  { attr: 'mapRoads', key: 'testlage-karta-vagstil', label: 'Karta: vägarnas stil', options: ROADS },
  { attr: 'mapNames', key: 'testlage-karta-namn', label: 'Karta: ortnamn', options: NAMES },
  { attr: 'mapWater', key: 'testlage-karta-vatten', label: 'Karta: vattnets färg', options: WATERS },
  { attr: 'mapWaterStyle', key: 'testlage-karta-vattenstil', label: 'Karta: vattnets mönster', options: WATER_STYLES },
  { attr: 'mapForest', key: 'testlage-karta-skog', label: 'Karta: skogens färg', options: FORESTS },
  { attr: 'mapForestStyle', key: 'testlage-karta-skogsstil', label: 'Karta: skogens stil', options: FOREST_STYLES },
  { attr: 'mapRegions', key: 'testlage-karta-landskap', label: 'Karta: landskap och län', options: REGIONS },
  { attr: 'mapHouseColors', key: 'testlage-hus-farger', label: 'Hus: färger', options: HOUSE_COLORS },
  { attr: 'mapHouseStyle', key: 'testlage-hus-stil', label: 'Hus: stil', options: HOUSE_STYLES },
  { attr: 'mapHouseHeight', key: 'testlage-hus-hojd', label: 'Hus: höjd', options: HOUSE_HEIGHTS },
]

// Husens ytor i vald stil.
function stylePalettes(palettes, { palette }) {
  if (palette === 'outlineOnly') return palettes.map(() => ({ roof: PAPER, lit: PAPER, dark: mix(PAPER, DARK, 0.06) }))
  if (palette === 'colouredRoofs') {
    return palettes.map(({ lit }) => ({ roof: lit, lit: mix(PAPER, lit, 0.2), dark: mix(mix(PAPER, lit, 0.2), DARK, 0.14) }))
  }
  // Väggen i full färg och taket nästan lika starkt, för stilar som behöver mer kraft.
  if (palette === 'deep') return palettes.map(({ lit }) => ({ roof: mix(lit, PAPER, 0.25), lit, dark: mix(lit, DARK, 0.28) }))
  if (palette === 'colouredWalls') return palettes.map(({ lit }) => ({ roof: mix(lit, PAPER, 0.75), lit: mix(lit, '#b5563d', 0.45), dark: mix(lit, '#7c3423', 0.5) }))
  return palettes
}

// Valen ihopslagna till ett tema. `choices` är valt id för varje väljare, i samma ordning som MAP_PICKERS.
export function composeMapTheme(choices) {
  const picked = MAP_PICKERS.map(({ options }, i) => options.find((o) => o.id === choices[i]) ?? options[0])
  const theme = Object.assign({}, ...picked)
  return { ...theme, palettes: stylePalettes(theme.palettes, theme) }
}

export const mapDefaultTheme = () => composeMapTheme(MAP_PICKERS.map(() => 'pre-dev'))
