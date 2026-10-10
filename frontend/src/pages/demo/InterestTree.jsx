// Intresseträdet på demons sista sida: intressen så som man själv kallar dem (större, gula) och
// något specifikt inom dem, subs (mindre, blå), med en tunn linje mellan nivåerna. Kategorierna
// (fältet `category`) visas inte, eftersom de kan bli för breda. Andra ord för samma sak (alias,
// t.ex. "utklädning" för cosplay) står som en liten text under taggen. Färgerna är appens egna (--color-accent, --color-line), och
// formen är samma som övriga taggar (.tag .tag-static). Storlekarna ligger här i stället för i
// index.css, eftersom trädet bara finns i demon.
const LEVELS = [
  { background: 'var(--color-accent)', borderColor: 'var(--color-accent)', fontSize: '1.1rem', padding: '0.45rem 1.1rem' },
  { background: 'var(--color-line)', borderColor: 'var(--color-line)', fontSize: '0.9rem', padding: '0.3rem 0.8rem' },
]

// Första bokstaven stor, så att taggarna ser ut som resten av appens taggar.
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const list = { listStyle: 'none', margin: 0, padding: 0 }
const column = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }
const row = { display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }

function Tag({ level, children }) {
  return (
    <span className="tag tag-static" style={LEVELS[level]}>
      {capitalize(children)}
    </span>
  )
}

// Alias: andra ord för samma sak, som liten text under taggen.
function Aliases({ aliases }) {
  if (!aliases?.length) return null
  return <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>även: {aliases.join(', ')}</span>
}

// Den tunna linjen mellan en tagg och det som ligger under den.
function Connector() {
  return <span aria-hidden="true" style={{ width: 2, height: '0.5rem', background: 'var(--color-line)' }} />
}

// `interests` är [{ name, aliases, subtags: [{ name, aliases }] }], där name är intresset och
// subtags är subs. Listorna kan vara tomma.
function InterestTree({ interests }) {
  return (
    <ul style={{ ...list, ...row, gap: '1.5rem 1.25rem', marginTop: '0.75rem' }}>
      {interests.map((interest) => (
        <li key={interest.name} style={column}>
          <Tag level={0}>{interest.name}</Tag>
          <Aliases aliases={interest.aliases} />
          {interest.subtags.length > 0 && (
            <>
              <Connector />
              <ul style={{ ...list, ...row, alignItems: 'flex-start', gap: '0.75rem' }}>
                {interest.subtags.map((sub) => (
                  <li key={sub.name} style={column}>
                    <Tag level={1}>{sub.name}</Tag>
                    <Aliases aliases={sub.aliases} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export default InterestTree
