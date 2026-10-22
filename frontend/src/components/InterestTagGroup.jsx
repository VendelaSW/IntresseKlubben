import { useCallback, useId, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { areaColors } from '../utils/interestColors'
import DrawnArrow from './DrawnArrow'

// Första bokstaven stor, så att egna intressen ("fyrmodeller") ser ut som bibliotekets.
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// En intressetagg med sina underintressen. Taggen har huvudområdets färg (se
// utils/interestColors.js) och ser ut som kartans lappar: handritad form och en
// hård skugga. Har intresset underintressen visar en ritad pil det, och ett tryck lägger
// dem i en ruta i samma färg över taggarna under (inget flyttar sig). Rutan
// stängs med ett nytt tryck, ett tryck utanför eller Esc. Utan underintressen
// händer inget när man trycker; taggen är bara till för att visa.
//
// - `group`: { key, name, area, subs: [{ key, name }], removable } (se utils/interestGroups.js)
// - `isShared(key)`: gemensamt med den man tittar på, ger fetstil och en bock (utan den: inga bockar)
// - `onRemove(key)`: ger ett × på taggen och underintressena (t.ex. när man redigerar sina intressen)
// - `busyKey`: taggen vars borttagning pågår, så att × inte går att trycka på igen
function InterestTagGroup({ group, isShared, onRemove, busyKey }) {
  const [open, setOpen] = useState(false)
  const closePanel = useCallback(() => setOpen(false), [])
  const rootRef = useRef(null)
  const panelId = useId()
  const { key, name, area, subs } = group
  const shared = (k) => isShared?.(k) ?? false
  const hasSubs = subs.length > 0

  useDismiss(rootRef, open, closePanel)

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
            <DrawnArrow className="interest-tag-arrow" />
            <span className="visually-hidden">, {subs.length} underintressen</span>
          </button>
        ) : (
          <span className="interest-tag-name">{capitalize(name)}</span>
        )}
        {group.removable !== false && remove(key, name)}
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

export default InterestTagGroup
