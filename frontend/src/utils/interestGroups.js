// Hur valda intressen blir taggar (InterestTags, InterestTree). Intressena
// grupperas per huvudområde (area, t.ex. Gaming):
// - Ett intresse som har ett valt intresse direkt under sig visas inte, eftersom
//   det under säger mer (väljer man Mysiga spel och Animal Crossing syns bara
//   Animal Crossing). Huvudområdet självt räknas in i taggen.
// - Blir det bara ett intresse kvar i området visas det direkt som en egen tagg
//   (bara "Animal Crossing", eller bara "Mysiga spel").
// - Blir det fler visas huvudområdet som tagg ("Gaming ▼"), och de andra som
//   underintressen, också om man inte själv har valt "Gaming".
//
// `items` är [{ key, name, area, parentKey, isArea }]: parentKey är det valda
// intresset direkt ovanför (eller null), och isArea säger att intresset är ett
// huvudområde. Ger [{ key, name, area, subs: [{ key, name }], removable }], där
// removable är false för ett huvudområde som bara visas för att samla
// intressena (det går inte att ta bort, eftersom det inte är valt).
export function groupTags(items) {
  const hasChosenChild = new Set(items.map((i) => i.parentKey).filter((k) => k != null))
  const byArea = new Map()
  for (const item of items) {
    const area = item.area ?? item.name
    if (!byArea.has(area)) byArea.set(area, [])
    byArea.get(area).push(item)
  }
  const groups = []
  for (const [area, members] of byArea) {
    const areaItem = members.find((m) => m.isArea)
    const shown = members.filter((m) => !m.isArea && !hasChosenChild.has(m.key))
    if (shown.length === 0) {
      // Bara huvudområdet (eller bara intressen som fälls ihop i det).
      const only = areaItem ?? members[0]
      groups.push({ key: only.key, name: only.name, area, subs: [], removable: true })
    } else if (shown.length === 1 && !areaItem) {
      groups.push({ key: shown[0].key, name: shown[0].name, area, subs: [], removable: true })
    } else {
      groups.push({
        key: areaItem ? areaItem.key : `area:${area}`,
        name: area,
        area,
        subs: shown.map((m) => ({ key: m.key, name: m.name })),
        removable: Boolean(areaItem),
      })
    }
  }
  return groups
}

// Intressen som grupper. Nycklarna är id:na. Intressena kommer antingen från en
// profil ({ id, name, parent_id, area }) eller från sökningen och Utforska när
// profilen skapas ({ id, name, path }), där huvudområdet är det första i path och
// föräldern det sista.
export function groupInterests(interests) {
  const parentOf = (i) => {
    if (i.parent_id !== undefined) return interests.find((other) => other.id === i.parent_id)
    const above = i.path?.at(-1)
    return above ? interests.find((other) => other.name === above) : undefined
  }
  return groupTags(
    interests.map((i) => ({
      key: i.id,
      name: i.name,
      area: i.area ?? i.path?.[0] ?? i.name,
      parentKey: parentOf(i)?.id ?? null,
      isArea: i.path ? i.path.length === 0 : i.parent_id == null,
    })),
  )
}
