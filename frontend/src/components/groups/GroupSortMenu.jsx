import { useEffect, useRef, useState } from 'react'
import { GROUP_SORTS } from '../../services/groups'

// Sorteringsknappen bredvid sökfältet: en ikon som öppnar en meny där varje
// sortering finns åt båda hållen. Stängs vid val, Escape eller klick utanför.
function GroupSortMenu({ sort, reverse, onChange }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(e) {
      if (!menuRef.current?.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = GROUP_SORTS.find((s) => s.value === sort)
  const currentLabel = `${current.label}: ${reverse ? current.reverseLabel : current.forwardLabel}`

  return (
    <div className="sort-menu" ref={menuRef}>
      <button
        type="button"
        className={`sort-menu-button${open ? ' sort-menu-button-open' : ''}`}
        aria-label={`Sortera (${currentLabel})`}
        title={`Sortera: ${currentLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="sort-menu-list" role="menu">
          {GROUP_SORTS.map((s) => (
            <div key={s.value} className="sort-menu-group" role="group" aria-label={s.label}>
              <span className="sort-menu-heading">{s.label}</span>
              {[false, true].map((rev) => {
                const checked = s.value === sort && rev === reverse
                return (
                  <button
                    key={String(rev)}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    className={`sort-menu-item${checked ? ' sort-menu-item-selected' : ''}`}
                    onClick={() => {
                      onChange(s.value, rev)
                      setOpen(false)
                    }}
                  >
                    {rev ? s.reverseLabel : s.forwardLabel}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default GroupSortMenu
