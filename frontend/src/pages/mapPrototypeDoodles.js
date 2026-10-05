// PROTOTYP: små "ritade" mönster för kartan, gjorda med canvas i stället för
// bildfiler. MapLibre ber om dem via händelsen `styleimagemissing` när ett
// lager använder dem (t.ex. fill-pattern: 'water-hatch').
//
// Allt ritas i dubbel upplösning (PIXEL_RATIO) så att strecken blir skarpa.
const PIXEL_RATIO = 2

// Liten slump som alltid blir likadan, så att mönstret inte ändras varje gång
// sidan laddas.
function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function draw(size, paint) {
  const canvas = document.createElement('canvas')
  canvas.width = size * PIXEL_RATIO
  canvas.height = size * PIXEL_RATIO
  const ctx = canvas.getContext('2d')
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  paint(ctx, size)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// Vatten: snedstreck med blå färgpenna, lite ojämna som när ett barn fyller i.
function waterHatch() {
  const rand = seededRandom(7)
  return draw(24, (ctx, size) => {
    ctx.strokeStyle = 'rgba(52, 110, 190, 0.55)'
    for (let i = -size; i < size * 2; i += 6) {
      ctx.lineWidth = 0.9 + rand() * 0.6
      ctx.beginPath()
      ctx.moveTo(i + rand() * 1.5, size)
      ctx.lineTo(i + size + rand() * 1.5, 0)
      ctx.stroke()
    }
  })
}

// En gran ritad som ett barn gör: stam och tre sicksack-våningar som blir
// smalare uppåt. (x, y) är stammens fot.
function drawPine(ctx, x, y, height, rand) {
  const width = height * 0.55
  ctx.strokeStyle = 'rgba(30, 80, 40, 0.9)'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  const tiers = 3
  for (let i = 0; i < tiers; i++) {
    const bottom = y - height * 0.15 - (i * height * 0.8) / tiers
    const top = bottom - (height * 0.85) / tiers - height * 0.12
    const half = (width / 2) * (1 - i * 0.25) + (rand() - 0.5) * 0.8
    ctx.moveTo(x - half, bottom)
    ctx.lineTo(x + (rand() - 0.5) * 0.6, top)
    ctx.lineTo(x + half, bottom)
  }
  ctx.stroke()
  // Stam.
  ctx.strokeStyle = 'rgba(90, 60, 30, 0.9)'
  ctx.beginPath()
  ctx.moveTo(x, y - height * 0.15)
  ctx.lineTo(x, y)
  ctx.stroke()
}

// Skog när man zoomat in: en liten grupp granar, olika höga. Används som
// symbol (inte mönster), så att granarna har samma storlek på skärmen
// oavsett zoom och inte "pumpar" mellan zoomnivåerna.
function pineGroup() {
  const rand = seededRandom(5)
  return draw(44, (ctx) => {
    drawPine(ctx, 13, 40, 22, rand)
    drawPine(ctx, 31, 41, 26, rand)
    drawPine(ctx, 22, 30, 20, rand)
  })
}

// --- Platser: små klotterikoner för ställen där en klubb kan träffas ---
// Alla ritas i en ruta på 34 px med en mjuk pappersfläck bakom, så att de
// syns även ovanpå vägar och byggnader.
const INK = 'rgba(58, 47, 37, 0.95)'
const PLACE_SIZE = 34

function placeDoodle(paint) {
  return () =>
    draw(PLACE_SIZE, (ctx, size) => {
      ctx.fillStyle = 'rgba(251, 240, 169, 0.85)'
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.6
      paint(ctx, size)
    })
}

// Sport: en springande streckgubbe med en boll vid foten. Ingen särskild
// sport, utan "rörelse" i allmänhet - plan, sporthall, bad, ishall osv.
const sportDoodle = placeDoodle((ctx) => {
  ctx.beginPath()
  ctx.arc(20, 8.5, 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  // Kropp, lutad framåt.
  ctx.moveTo(19, 11.5)
  ctx.lineTo(15.5, 19)
  // Armar.
  ctx.moveTo(18.2, 13.5)
  ctx.lineTo(23.5, 15.5)
  ctx.moveTo(18.2, 13.5)
  ctx.lineTo(13, 13)
  // Ben: ett framåt, ett bakåt.
  ctx.moveTo(15.5, 19)
  ctx.lineTo(20, 22.5)
  ctx.lineTo(19, 27)
  ctx.moveTo(15.5, 19)
  ctx.lineTo(11.5, 23.5)
  ctx.lineTo(8, 22.5)
  ctx.stroke()
  // Boll.
  ctx.beginPath()
  ctx.arc(25, 25.5, 2.6, 0, Math.PI * 2)
  ctx.stroke()
  // Fartstreck.
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(6, 15)
  ctx.lineTo(10, 15)
  ctx.moveTo(5, 18)
  ctx.lineTo(9, 18)
  ctx.stroke()
})

// Fika och mat: en kopp med ånga.
const fikaDoodle = placeDoodle((ctx) => {
  ctx.beginPath()
  ctx.moveTo(9, 15)
  ctx.lineTo(10.5, 25)
  ctx.lineTo(21.5, 25)
  ctx.lineTo(23, 15)
  ctx.closePath()
  ctx.stroke()
  // Öra.
  ctx.beginPath()
  ctx.arc(24, 19, 3, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()
  // Ånga.
  ctx.lineWidth = 1.2
  for (const x of [13, 17.5]) {
    ctx.beginPath()
    ctx.moveTo(x, 12)
    ctx.bezierCurveTo(x - 2, 10, x + 2, 8, x, 6)
    ctx.stroke()
  }
})

// En teatermask: mitten i (cx, cy), glad eller ledsen mun.
function mask(ctx, cx, cy, happy) {
  ctx.fillStyle = 'rgba(251, 240, 169, 1)'
  ctx.beginPath()
  ctx.moveTo(cx - 6, cy - 6)
  ctx.quadraticCurveTo(cx, cy - 8.5, cx + 6, cy - 6)
  ctx.quadraticCurveTo(cx + 6.5, cy + 4, cx, cy + 8)
  ctx.quadraticCurveTo(cx - 6.5, cy + 4, cx - 6, cy - 6)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  // Ögon som små bågar.
  ctx.moveTo(cx - 4, cy - 1.5)
  ctx.quadraticCurveTo(cx - 2.5, cy - 3.5, cx - 1, cy - 1.5)
  ctx.moveTo(cx + 1, cy - 1.5)
  ctx.quadraticCurveTo(cx + 2.5, cy - 3.5, cx + 4, cy - 1.5)
  // Mun.
  if (happy) {
    ctx.moveTo(cx - 3, cy + 2.5)
    ctx.quadraticCurveTo(cx, cy + 6, cx + 3, cy + 2.5)
  } else {
    ctx.moveTo(cx - 3, cy + 5)
    ctx.quadraticCurveTo(cx, cy + 2, cx + 3, cy + 5)
  }
  ctx.stroke()
}

// Kultur: två teatermasker, en glad och en ledsen - bibliotek, museum,
// konsthall, teater, bio.
const cultureDoodle = placeDoodle((ctx) => {
  ctx.lineWidth = 1.4
  mask(ctx, 21, 15, false)
  mask(ctx, 13, 19, true)
})

// En pratbubbla med svans nere till vänster eller höger.
function bubble(ctx, x, y, w, h, tailLeft) {
  ctx.fillStyle = 'rgba(251, 240, 169, 1)'
  ctx.beginPath()
  ctx.moveTo(x + 3, y)
  ctx.lineTo(x + w - 3, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + 3)
  ctx.lineTo(x + w, y + h - 3)
  ctx.quadraticCurveTo(x + w, y + h, x + w - 3, y + h)
  if (tailLeft) {
    ctx.lineTo(x + 7, y + h)
    ctx.lineTo(x + 2, y + h + 4)
    ctx.lineTo(x + 3.5, y + h)
  } else {
    ctx.lineTo(x + w - 3.5, y + h)
    ctx.lineTo(x + w - 2, y + h + 4)
    ctx.lineTo(x + w - 7, y + h)
  }
  ctx.lineTo(x + 3, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - 3)
  ctx.lineTo(x, y + 3)
  ctx.quadraticCurveTo(x, y, x + 3, y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

// Träffpunkt: två pratbubblor - kvarterslokaler och andra mötesplatser.
const meetDoodle = placeDoodle((ctx) => {
  ctx.lineWidth = 1.4
  bubble(ctx, 13, 8, 14, 10, false)
  bubble(ctx, 6, 14, 15, 10, true)
  // Tre prickar i den främre bubblan.
  ctx.fillStyle = INK
  for (const x of [10, 13.5, 17]) {
    ctx.beginPath()
    ctx.arc(x, 19, 1, 0, Math.PI * 2)
    ctx.fill()
  }
})

// Natur: en kulle med solen bakom - parker, picknickplatser, utsikter.
const natureDoodle = placeDoodle((ctx) => {
  // Sol med strålar.
  ctx.beginPath()
  ctx.arc(22, 12, 3.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1.1
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    ctx.moveTo(22 + Math.cos(a) * 5, 12 + Math.sin(a) * 5)
    ctx.lineTo(22 + Math.cos(a) * 7, 12 + Math.sin(a) * 7)
  }
  ctx.stroke()
  // Kullar.
  ctx.lineWidth = 1.6
  ctx.fillStyle = 'rgba(143, 179, 107, 0.6)'
  ctx.beginPath()
  ctx.moveTo(5, 26)
  ctx.quadraticCurveTo(12, 14, 20, 24)
  ctx.quadraticCurveTo(24, 20, 29, 26)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
})

// Lek: en rutschkana med stege.
const playDoodle = placeDoodle((ctx) => {
  ctx.beginPath()
  // Stege.
  ctx.moveTo(9, 26)
  ctx.lineTo(11, 9)
  ctx.moveTo(14, 26)
  ctx.lineTo(15, 9)
  for (const y of [13, 17, 21]) {
    ctx.moveTo(10.3, y)
    ctx.lineTo(14.6, y)
  }
  // Plattform och kana.
  ctx.moveTo(11, 9)
  ctx.lineTo(16, 9)
  ctx.quadraticCurveTo(20, 10, 23, 20)
  ctx.quadraticCurveTo(24.5, 25, 28, 25)
  ctx.stroke()
})

const DOODLES = {
  'water-hatch': waterHatch,
  'pine-group': pineGroup,
  'place-sport': sportDoodle,
  'place-fika': fikaDoodle,
  'place-culture': cultureDoodle,
  'place-meet': meetDoodle,
  'place-nature': natureDoodle,
  'place-play': playDoodle,
}

// Kopplas till kartan: lägger till ett mönster eller en symbol första
// gången den behövs.
export function addMissingDoodle(map, id) {
  const make = DOODLES[id]
  if (make && !map.hasImage(id)) map.addImage(id, make(), { pixelRatio: PIXEL_RATIO })
}
