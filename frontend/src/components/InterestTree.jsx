import { groupTags } from '../utils/interestGroups'
import InterestTagGroup from './InterestTagGroup'

// Intressen som taggar, per huvudområde (se utils/interestGroups.js och InterestTagGroup). Används för förslagen på
// intervjuns sista sida och för intressena på profilen (den egna och andras, se profileTree). Med `onRemove` har
// taggarna ett kryss. I intervjun tas ett intresses subs bort med det (se descendantKeys).

// Förslaget ett förslag ligger under i bilden: dess parent_key (en sub under ett nytt intresse i samma analys),
// annars det närmaste förslaget ovanför i förslagets plats i trädet (path). Så ligger "Mynt" och "Förintelsen"
// under "Historia" när de föreslås tillsammans med Historia, och "Animal Crossing" (Gaming › Mysiga spel) under
// "Gaming" även när "Mysiga spel" inte är med. Finns inget sådant ligger förslaget överst.
export function parentKeyOf(proposal, proposals) {
  if (proposal.interest.parent_key) return proposal.interest.parent_key
  for (const above of [...(proposal.interest.path ?? [])].reverse()) {
    const parent = proposals.find((p) => p.key !== proposal.key && p.interest.name.toLowerCase() === above.toLowerCase())
    if (parent) return parent.key
  }
  return null
}

// Profilens intressen ({ id, name, parent_id, area }) i samma form som förslagen, så att de kan ritas som taggar. Ett
// intresse har sin förälder som parent_key om personen också har valt den.
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

// `proposals` är förslagen som ska visas: [{ key, interest: { name, path, parent_key, area } }]. De blir taggar per
// huvudområde (se utils/interestGroups.js): ett ensamt intresse visas direkt, flera samlas under huvudområdet (▼).
// Huvudområdet är `area` om den finns (profilen), annars det översta i `path` (förslagen i intervjun).
// - `onRemove(key)`: ger ett × på taggarna; utan den visas de utan
// - `highlight`: nycklarna som är gemensamma med en själv (fetstil och bock); utan den markeras inga
// - `busyKey`: taggen vars borttagning pågår, så att den inte går att trycka på igen
// - `align`: 'center' (intervjun) eller 'start' (profilen)
function InterestTree({ proposals, onRemove, highlight, busyKey, align = 'center' }) {
  const groups = groupTags(
    proposals.map((p) => ({
      key: p.key,
      name: p.interest.name,
      area: p.interest.area ?? p.interest.path?.[0] ?? p.interest.name,
      parentKey: parentKeyOf(p, proposals),
      isArea: p.interest.parent_id !== undefined ? p.interest.parent_id == null : !p.interest.path?.length,
    })),
  )
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
