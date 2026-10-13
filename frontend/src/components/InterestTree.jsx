import { useState } from 'react'

// Intressen som ett träd: varje intresse är en tagg, och ett intresse vars förälder också finns med visas under den
// (Fyrmodeller under Modellbygge, Mynt under Historia). Används för förslagen på intervjuns sista sida och för
// intressena på profilen (den egna och andras, se profileTree). Med `onRemove` är taggarna knappar med ett kryss.
// I intervjun tas ett intresses subs bort med det (se descendantKeys); på profilen ligger de kvar och flyttas upp.
//
// Färgerna är appens egna (--color-accent, --color-accent-soft), och formen är samma som övriga taggar
// (.tag). Storlekarna ligger här i stället för i index.css, eftersom de bara gäller trädet.
const LEVELS = [
  { background: 'var(--color-accent)', borderColor: 'var(--color-accent)', fontSize: '1.1rem', padding: '0.45rem 1.1rem' },
  {
    background: 'var(--color-accent-soft)',
    borderColor: 'var(--color-accent)',
    fontSize: '0.75rem',
    padding: '0.15rem 0.6rem',
  },
]

// Första bokstaven stor, så att taggarna ser ut som resten av appens taggar.
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const list = { listStyle: 'none', margin: 0, padding: 0 }
const column = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', maxWidth: '100%' }
// Ett långt namn bryts i stället för att sticka ut ur rutan (på mobil).
const wrap = { maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'center' }
const row = { display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }

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

// På profilen syns så många underintressen under ett intresse innan resten fälls ut med ⋯, så att trädet inte tar
// för mycket plats.
export const PROFILE_MAX_SUBS = 3

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

// Bara storleken på en nivå, utan färg: en vanlig vit tagg.
const sizeOf = (level) => ({ fontSize: LEVELS[level].fontSize, padding: LEVELS[level].padding })

// En markerad tagg är gul (.tag-selected, som tonas vid hover och tangentbordsfokus). En omarkerad (ett intresse man
// inte delar med den man tittar på) är en vanlig vit tagg.
function Tag({ level, name, marked, disabled, onRemove }) {
  const style = { ...wrap, ...(marked ? LEVELS[level] : sizeOf(level)) }
  const selected = marked ? ' tag-selected' : ''
  if (!onRemove) {
    return (
      <span className={`tag tag-static${selected}`} style={style}>
        {capitalize(name)}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`tag${selected}`}
      style={style}
      aria-label={`Ta bort ${name}`}
      disabled={disabled}
      onClick={onRemove}
    >
      {capitalize(name)} <span aria-hidden="true">×</span>
    </button>
  )
}

// Ett förslag med det som ligger under det, rekursivt. De två översta nivåerna har egna storlekar, resten följer den
// andra. Med `maxSubs` visas bara så många subs, och resten fälls ut med ⋯.
function Node({ proposal, level, ...tree }) {
  const { proposals, onRemove, highlight, busyKey, maxSubs } = tree
  const [showAll, setShowAll] = useState(false)
  const subs = proposals.filter((p) => parentKeyOf(p, proposals) === proposal.key)
  const hidden = maxSubs && !showAll ? Math.max(subs.length - maxSubs, 0) : 0
  const name = proposal.interest.name
  return (
    <li style={column}>
      <Tag
        level={Math.min(level, 1)}
        name={name}
        marked={!highlight || highlight.has(proposal.key)}
        disabled={busyKey === proposal.key}
        onRemove={onRemove && (() => onRemove(proposal.key))}
      />
      {subs.length > 0 && (
        <ul style={{ ...list, ...row, alignItems: 'flex-start', gap: '0.25rem', marginTop: '-0.15rem' }}>
          {subs.slice(0, subs.length - hidden).map((sub) => (
            <Node key={sub.key} proposal={sub} level={level + 1} {...tree} />
          ))}
          {maxSubs && subs.length > maxSubs && (
            <li>
              <button
                type="button"
                className="tag"
                style={sizeOf(1)}
                aria-expanded={showAll}
                aria-label={showAll ? `Visa färre under ${name}` : `Visa alla ${subs.length} under ${name}`}
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Visa färre' : '⋯'}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

// `proposals` är förslagen som ska visas: [{ key, interest: { name, path, parent_key } }]. `onRemove(key)` anropas
// när man tar bort ett intresse. Utan den visas taggarna utan kryss.
// - `highlight`: nycklarna som ska vara gula (gemensamma intressen); utan den är alla gula
// - `busyKey`: taggen vars borttagning pågår, så att den inte går att trycka på igen
// - `maxSubs`: högst så många subs under varje intresse innan ⋯
// - `align`: 'center' (intervjun) eller 'start' (profilen)
function InterestTree({ proposals, onRemove, highlight, busyKey, maxSubs, align = 'center' }) {
  const tops = proposals.filter((p) => !parentKeyOf(p, proposals))
  const tree = { proposals, onRemove, highlight, busyKey, maxSubs }
  return (
    <ul style={{ ...list, ...row, justifyContent: align, gap: '1.5rem 1.25rem', marginTop: '0.75rem' }}>
      {tops.map((top) => (
        <Node key={top.key} proposal={top} level={0} {...tree} />
      ))}
    </ul>
  )
}

export default InterestTree
