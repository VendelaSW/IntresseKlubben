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

// Nycklarna på ett förslag och allt som ligger under det (subs, och subs under dem).
export function descendantKeys(proposals, key) {
  const keys = new Set([key])
  let grew = true
  while (grew) {
    grew = false
    for (const p of proposals) {
      if (p.interest.parent_key && keys.has(p.interest.parent_key) && !keys.has(p.key)) {
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

// `proposals` är förslagen som ska visas: [{ key, interest: { name, parent_key } }]. `onRemove(key)` anropas
// när man tar bort ett intresse. Utan den visas taggarna utan kryss.
function InterestTree({ proposals, onRemove }) {
  const keys = new Set(proposals.map((p) => p.key))
  // Överst: förslag utan förälder bland de som visas (en sub vars förälder är borttagen visas inte alls).
  const tops = proposals.filter((p) => !p.interest.parent_key)
  const subsOf = (key) => proposals.filter((p) => p.interest.parent_key === key && keys.has(key))
  return (
    <ul style={{ ...list, ...row, gap: '1.5rem 1.25rem', marginTop: '0.75rem' }}>
      {tops.map((top) => (
        <li key={top.key} style={column}>
          <Tag level={0} name={top.interest.name} onRemove={onRemove && (() => onRemove(top.key))} />
          {subsOf(top.key).length > 0 && (
            <ul style={{ ...list, ...row, alignItems: 'flex-start', gap: '0.25rem', marginTop: '-0.15rem' }}>
              {subsOf(top.key).map((sub) => (
                <li key={sub.key} style={column}>
                  <Tag level={1} name={sub.interest.name} onRemove={onRemove && (() => onRemove(sub.key))} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

export default InterestTree
