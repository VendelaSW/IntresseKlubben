// Hur valda intressen blir taggar (InterestTags, InterestTree). Allt man valt
// syns, och varje intresse är en egen tagg, tills fler än GROUP_AFTER valda
// intressen ligger under samma kategori. Då samlas de i kategorins tagg ("Gaming
// ▼"), också om man inte själv har valt kategorin. Den närmaste kategorin går
// först: fyra mysiga spel blir "Mysiga spel ▼", och två actionspel bredvid dem
// blir egna taggar (de är inte fler än tre som är kvar under Gaming).
const GROUP_AFTER = 3

// `items` är [{ key, name, path, area, areaSlug }], där path är namnen ovanför
// intresset i trädet, uppifrån ([] för ett huvudområde). area (huvudområdets
// namn) behövs bara när path saknas, som för ett events eller en klubbs intresse,
// och areaSlug är huvudområdets slug, som färgen slås upp på (se
// utils/interestColors.js). Ger [{ key, name, area, areaSlug, subs: [{ key, name
// }], removable }] i samma ordning som intressena. removable är
// false för en kategori som bara visas för att samla intressena (den är inte
// vald och går inte att ta bort).
export function groupTags(items) {
  const place = (path) => path.join(' › ')
  const placeOf = (item) => place([...item.path, item.name])
  // Kategorierna ovanför något valt, den närmaste (djupaste) först.
  const categories = new Map()
  for (const item of items) {
    item.path.forEach((_, i) => {
      const path = item.path.slice(0, i + 1)
      categories.set(place(path), path)
    })
  }
  const groupOf = new Map() // intressets key -> gruppen det ligger i
  for (const [at, path] of [...categories].sort((a, b) => b[1].length - a[1].length)) {
    const under = items.filter((i) => !groupOf.has(i.key) && placeOf(i) !== at && placeOf(i).startsWith(`${at} › `))
    if (under.length <= GROUP_AFTER) continue
    const chosen = items.find((i) => !groupOf.has(i.key) && placeOf(i) === at)
    const group = {
      key: chosen ? chosen.key : `kategori:${at}`,
      name: path.at(-1),
      area: path[0],
      areaSlug: under[0].areaSlug,
      subs: under.map((i) => ({ key: i.key, name: i.name })),
      removable: Boolean(chosen),
    }
    for (const i of chosen ? [chosen, ...under] : under) groupOf.set(i.key, group)
  }
  // I intressenas ordning: en grupp där dess första intresse (eller kategorin själv) står.
  const result = []
  for (const item of items) {
    const group = groupOf.get(item.key)
    const area = item.area ?? item.path[0] ?? item.name
    if (!group) result.push({ key: item.key, name: item.name, area, areaSlug: item.areaSlug, subs: [], removable: true })
    else if (!result.includes(group)) result.push(group)
  }
  return result
}

// Intressen som grupper. Nycklarna är id:na. Intressena kommer från en profil
// eller från sökningen och biblioteket när profilen skapas (med path), eller är
// ett events eller en klubbs enda intresse (bara area). area_slug är
// huvudområdets slug, när den finns.
export function groupInterests(interests) {
  return groupTags(
    interests.map((i) => ({ key: i.id, name: i.name, path: i.path ?? [], area: i.area, areaSlug: i.area_slug })),
  )
}
