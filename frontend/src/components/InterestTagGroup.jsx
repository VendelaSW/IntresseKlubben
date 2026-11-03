import { useCallback, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDismiss } from '../hooks/useDismiss'
import { areaColors } from '../utils/interestColors'
import { capitalize } from '../utils/interestGroups'
import DrawnArrow from './DrawnArrow'
import InterestTagPanel from './InterestTagPanel'

// En intressetagg med sina underintressen. Taggen har huvudområdets färg (se
// utils/interestColors.js) och ser ut som kartans lappar: handritad form och en
// hård skugga. Har intresset underintressen visar en ritad pil det, och ett tryck lägger
// dem i en ruta i samma färg över taggarna under (inget flyttar sig), eller i ett ark
// nedifrån på en smal skärm (se InterestTagPanel). Rutan stängs med ett nytt tryck,
// ett tryck utanför eller Esc. Utan underintressen händer inget när man trycker, om
// inte taggen är en länk till intressets sida (`pageHref`).
//
// - `group`: { key, name, areaSlug, subs: [{ key, name }], removable } (se utils/interestGroups.js)
// - `isShared(key)`: gemensamt med den man tittar på, ger fetstil och en bock (utan den: inga bockar)
// - `onRemove(key)`: ger ett × på taggen och underintressena (t.ex. när man redigerar sina intressen)
// - `busyKey`: taggen vars borttagning pågår, så att × inte går att trycka på igen
// - `pageHref(key)`: adressen till intressets sida, eller null (SCRUM-306). Med den är namnen länkar, och rutan har
//   "Om {intresse} ›" överst. Utan den (t.ex. på personkorten, som själva är länkar) är taggarna bara text.
function InterestTagGroup({ group, isShared, onRemove, busyKey, pageHref }) {
  const [open, setOpen] = useState(false)
  const closePanel = useCallback(() => setOpen(false), [])
  const rootRef = useRef(null)
  const panelId = useId()
  const { key, name, areaSlug, subs } = group
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

  const tagName = (k, label) => {
    const href = pageHref?.(k)
    return href ? (
      <Link to={href} className="interest-tag-name interest-tag-link">
        {capitalize(label)}
      </Link>
    ) : (
      <span className="interest-tag-name">{capitalize(label)}</span>
    )
  }

  return (
    <li ref={rootRef} className={`interest-tag-group${open ? ' is-open' : ''}`} style={areaColors(areaSlug)}>
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
          tagName(key, name)
        )}
        {group.removable !== false && remove(key, name)}
      </span>
      {open && (
        <InterestTagPanel id={panelId} title={capitalize(name)} pageHref={pageHref?.(key)} onClose={closePanel}>
          {subs.map((sub) => (
            <li key={sub.key}>
              <span className={`interest-tag interest-tag-sub${shared(sub.key) ? ' is-shared' : ''}`}>
                {tagName(sub.key, sub.name)}
                {remove(sub.key, sub.name)}
              </span>
            </li>
          ))}
        </InterestTagPanel>
      )}
    </li>
  )
}

export default InterestTagGroup
