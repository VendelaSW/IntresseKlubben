// Förslagen på intressen från analysen på intervjuns sista sida. Varje intresse är en tagg, och en sub under ett
// nytt intresse (Fyrmodeller under Modellbygge) visas under sin förälder. Med `onRemove` är taggarna knappar med
// ett kryss: ett klick tar bort intresset, och tar man bort ett intresse tas dess subs bort med (se
// descendantKeys), så att man aldrig behåller ett barn utan förälder.
//
// Färgerna är appens egna (--color-accent, --color-accent-soft), och formen är samma som övriga taggar
// (.tag). Storlekarna ligger här i stället för i index.css, eftersom trädet bara finns i intervjun.
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
const column = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }
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

function Tag({ level, name, onRemove }) {
  if (!onRemove) {
    return (
      <span className="tag tag-static" style={LEVELS[level]}>
        {capitalize(name)}
      </span>
    )
  }
  return (
    <button type="button" className="tag" style={LEVELS[level]} aria-label={`Ta bort ${name}`} onClick={onRemove}>
      {capitalize(name)} <span aria-hidden="true">×</span>
    </button>
  )
}

// Ett förslag med det som ligger under det, rekursivt. De två översta nivåerna har egna storlekar, resten följer den
// andra.
function Node({ proposal, level, proposals, onRemove }) {
  const subs = proposals.filter((p) => parentKeyOf(p, proposals) === proposal.key)
  return (
    <li style={column}>
      <Tag level={Math.min(level, 1)} name={proposal.interest.name} onRemove={onRemove && (() => onRemove(proposal.key))} />
      {subs.length > 0 && (
        <ul style={{ ...list, ...row, alignItems: 'flex-start', gap: '0.25rem', marginTop: '-0.15rem' }}>
          {subs.map((sub) => (
            <Node key={sub.key} proposal={sub} level={level + 1} proposals={proposals} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </li>
  )
}

// `proposals` är förslagen som ska visas: [{ key, interest: { name, path, parent_key } }]. `onRemove(key)` anropas
// när man tar bort ett intresse. Utan den visas taggarna utan kryss.
function InterestTree({ proposals, onRemove }) {
  const tops = proposals.filter((p) => !parentKeyOf(p, proposals))
  return (
    <ul style={{ ...list, ...row, gap: '1.5rem 1.25rem', marginTop: '0.75rem' }}>
      {tops.map((top) => (
        <Node key={top.key} proposal={top} level={0} proposals={proposals} onRemove={onRemove} />
      ))}
    </ul>
  )
}

export default InterestTree
