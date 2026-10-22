import InterestTagGroup from './InterestTagGroup'

// Intressen som taggar: varje intresse är en tagg, och det som ligger under ett intresse som också finns med
// (Fyrmodeller under Modellbygge, Mynt under Historia) fälls ut från den med ▼ (se InterestTagGroup). Används för
// förslagen på intervjuns sista sida och för intressena på profilen (den egna och andras, se profileTree). Med
// `onRemove` har taggarna ett kryss. I intervjun tas ett intresses subs bort med det (se descendantKeys); på profilen
// ligger de kvar och flyttas upp.

// Förslaget ett förslag ligger under i bilden: dess parent_key (en sub under ett nytt intresse i samma analys),
// annars ett annat förslag vars intresse heter som det sista namnet i förslagets plats i trädet. Så ligger
// "Mynt" och "Förintelsen" under "Historia" när de föreslås tillsammans med Historia. Finns ingen sådan ligger
// förslaget överst.
export function parentKeyOf(proposal, proposals) {
  if (proposal.interest.parent_key) return proposal.interest.parent_key
  const above = proposal.interest.path?.at(-1)
  if (!above) return null
  const parent = proposals.find((p) => p.key !== proposal.key && p.interest.name.toLowerCase() === above.toLowerCase())
  return parent ? parent.key : null
}

// Profilens intressen ({ id, name, parent_id }) i samma form som förslagen, så att de kan ritas som ett träd. Ett
// intresse hamnar under sin förälder bara om personen också har valt föräldern, annars överst.
export function profileTree(interests) {
  const ids = new Set(interests.map((i) => i.id))
  return interests.map((i) => ({
    key: `id:${i.id}`,
    interest: { ...i, parent_key: ids.has(i.parent_id) ? `id:${i.parent_id}` : null },
  }))
}

// Samma intresse? Ett befintligt intresse är samma om id:t är samma, ett nytt om namnet och platsen i trädet är det.
// Används för att inte visa (eller lägga till) samma intresse två gånger när det kommer från två analyser.
export function interestKey(proposal) {
  const { id, name, path } = proposal.interest
  return id !== null && id !== undefined ? `id:${id}` : `ny:${name.toLowerCase()}|${(path ?? []).join('>').toLowerCase()}`
}

// Förslagen i `fresh` som inte redan finns bland `existing`, och inte ligger under något som redan finns (en dubblett av
// ett nytt intresse tar med sig det som ligger under den i samma analys).
export function withoutDuplicates(fresh, existing) {
  const seen = new Set(existing.map(interestKey))
  const dropped = new Set()
  const kept = []
  for (const p of fresh) {
    const parent = p.interest.parent_key
    if (seen.has(interestKey(p)) || (parent && dropped.has(parent))) {
      dropped.add(p.key)
    } else {
      seen.add(interestKey(p))
      kept.push(p)
    }
  }
  return kept
}

// Nycklarna på ett förslag och allt som ligger under det (subs, och subs under dem).
export function descendantKeys(proposals, key) {
  const keys = new Set([key])
  let grew = true
  while (grew) {
    grew = false
    for (const p of proposals) {
      const parent = parentKeyOf(p, proposals)
      if (parent && keys.has(parent) && !keys.has(p.key)) {
        keys.add(p.key)
        grew = true
      }
    }
  }
  return keys
}

// `proposals` är förslagen som ska visas: [{ key, interest: { name, path, parent_key, area } }]. Varje förslag utan
// förälder blir en tagg (InterestTagGroup), och allt som ligger under det blir dess underintressen, som fälls ut med ▼.
// Färgen följer huvudområdet: `area` om den finns (profilen), annars det översta i `path` (förslagen i intervjun).
// - `onRemove(key)`: ger ett × på taggarna; utan den visas de utan
// - `highlight`: nycklarna som är gemensamma med en själv (fetstil och bock); utan den markeras inga
// - `busyKey`: taggen vars borttagning pågår, så att den inte går att trycka på igen
// - `align`: 'center' (intervjun) eller 'start' (profilen)
function InterestTree({ proposals, onRemove, highlight, busyKey, align = 'center' }) {
  const groups = proposals
    .filter((p) => !parentKeyOf(p, proposals))
    .map((top) => ({
      key: top.key,
      name: top.interest.name,
      area: top.interest.area ?? top.interest.path?.[0] ?? top.interest.name,
      subs: [...descendantKeys(proposals, top.key)]
        .filter((k) => k !== top.key)
        .map((k) => proposals.find((p) => p.key === k))
        .map((p) => ({ key: p.key, name: p.interest.name })),
    }))
  return (
    <ul className={`interest-tags${align === 'start' ? '' : ' interest-tags-center'}`}>
      {groups.map((group) => (
        <InterestTagGroup
          key={group.key}
          group={group}
          isShared={highlight && ((k) => highlight.has(k))}
          onRemove={onRemove}
          busyKey={busyKey}
        />
      ))}
    </ul>
  )
}

export default InterestTree
