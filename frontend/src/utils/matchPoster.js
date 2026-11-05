import { areaColors } from './interestColors'

// Så många färger får raden överst på kortet ha.
const MAX_STRIPS = 4

// Färgerna på raden överst på kortet: ett fält per huvudområde som personens intressen ligger i (samma färg som taggarna),
// de områden ni har flest gemensamma först, därefter de där personen har flest intressen. Högst MAX_STRIPS, och en person
// utan intressen får den neutrala färgen. Ger [färg i raden, och raden som en gradient med skarpa övergångar].
export function posterStrip(interests, sharedIds) {
  const areas = new Map() // huvudområdets slug -> { shared, total }
  for (const interest of interests ?? []) {
    const area = areas.get(interest.area_slug) ?? { shared: 0, total: 0 }
    area.total += 1
    if (sharedIds?.has(interest.id)) area.shared += 1
    areas.set(interest.area_slug, area)
  }
  const ranked = [...areas].sort(([, a], [, b]) => b.shared - a.shared || b.total - a.total).slice(0, MAX_STRIPS)
  const colors = (ranked.length ? ranked.map(([slug]) => slug) : [undefined]).map((slug) => areaColors(slug)['--tag-fill'])
  const stops = colors.map((color, i) => `${color} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`)
  return [colors[0], stops.join(', ')]
}
