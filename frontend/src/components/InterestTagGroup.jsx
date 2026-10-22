import { useEffect, useId, useRef, useState } from 'react'
import { areaColors } from '../utils/interestColors'

// Första bokstaven stor, så att egna intressen ("fyrmodeller") ser ut som bibliotekets.
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// En intressetagg med sina underintressen. Taggen har huvudområdets färg (se
// utils/interestColors.js) och ser ut som kartans lappar: handritad form och en
// hård skugga. Har intresset underintressen visar ▼ det, och ett tryck lägger
// dem i en ruta i samma färg över taggarna under (inget flyttar sig). Rutan
// stängs med ett nytt tryck, ett tryck utanför eller Esc. Utan underintressen
// händer inget när man trycker; taggen är bara till för att visa.
//
// - `group`: { key, name, area, subs: [{ key, name }] } (se groupInterests och InterestTree)
// - `isShared(key)`: gemensamt med den man tittar på, ger fetstil och en bock (utan den: inga bockar)
// - `onRemove(key)`: ger ett × på taggen och underintressena (t.ex. när man redigerar sina intressen)
// - `busyKey`: taggen vars borttagning pågår, så att × inte går att trycka på igen
function InterestTagGroup({ group, isShared, onRemove, busyKey }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const panelId = useId()
  const { key, name, area, subs } = group
  const shared = (k) => isShared?.(k) ?? false
  const hasSubs = subs.length > 0

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const remove = (k, label) =>
    onRemove && (
      <button
        type="button"
        className="interest-tag-remove"
        aria-label={`Ta bort ${label}`}
        disabled={busyKey === k}
        onClick={() => onRemove(k)}
      >
        ×
      </button>
    )

  return (
    <li ref={rootRef} className={`interest-tag-group${open ? ' is-open' : ''}`} style={areaColors(area)}>
      {/* Ett huvudintresse är markerat som gemensamt också när bara ett underintresse är det. */}
      <span className={`interest-tag${shared(key) || subs.some((s) => shared(s.key)) ? ' is-shared' : ''}`}>
        {hasSubs ? (
          <button
            type="button"
            className="interest-tag-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
          >
            {capitalize(name)}
            <span className="interest-tag-arrow" aria-hidden="true">
              ▼
            </span>
            <span className="visually-hidden">, {subs.length} underintressen</span>
          </button>
        ) : (
          <span className="interest-tag-name">{capitalize(name)}</span>
        )}
        {remove(key, name)}
      </span>
      {open && (
        <ul id={panelId} className="interest-tag-panel">
          {subs.map((sub) => (
            <li key={sub.key}>
              <span className={`interest-tag interest-tag-sub${shared(sub.key) ? ' is-shared' : ''}`}>
                <span className="interest-tag-name">{capitalize(sub.name)}</span>
                {remove(sub.key, sub.name)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// Det valda intresse som `interest` ska ligga under, eller null om det ska vara
// en egen tagg. Först föräldern, om den är vald. Annars huvudområdet, om det är
// valt: ett mellanled som inte är valt ska inte göra att intresset hamnar för sig
// (Animal Crossing ligger under Gaming › Mysiga spel, och hamnar under Gaming
// även när Mysiga spel inte är valt). Vi vet bara föräldern och huvudområdet,
// inte hela vägen, därför de två.
export function selectedParentOf(interest, interests) {
  const parent = interests.find((i) => i.id === interest.parent_id)
  if (parent) return parent
  if (interest.area == null || interest.area === interest.name) return null
  return interests.find((i) => i.name === interest.area && i.parent_id == null && i.id !== interest.id) ?? null
}

// Intressen ({ id, name, parent_id, area }) som grupper: varje intresse som
// inte ligger under något valt (se selectedParentOf) blir en tagg, och allt som
// ligger under det (också flera nivåer ner) blir dess underintressen. Nycklarna
// är id:na.
export function groupInterests(interests) {
  const topOf = (interest) => {
    let top = interest
    const seen = new Set([top.id])
    for (let up = selectedParentOf(top, interests); up && !seen.has(up.id); up = selectedParentOf(top, interests)) {
      seen.add(up.id)
      top = up
    }
    return top
  }
  const groups = new Map()
  for (const interest of interests) {
    const top = topOf(interest)
    if (!groups.has(top.id)) groups.set(top.id, { key: top.id, name: top.name, area: top.area, subs: [] })
    if (top !== interest) groups.get(top.id).subs.push({ key: interest.id, name: interest.name })
  }
  return [...groups.values()]
}

export default InterestTagGroup
