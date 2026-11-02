import { useEffect, useId, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'

// En egen rullista där man kryssar i flera alternativ, t.ex. kön i Medlemmars filter (en <select> kan inte visa
// kryssrutor). Ett val stänger inte listan. Samma uppbyggnad som MunicipalityPicker. `values` är de valda
// alternativens värden (en lista, tom = inget valt), och `onChange` får den nya listan. `options` är
// [{ value, label }]. På knappen står de valda, eller `emptyLabel` när inget är valt.
//
// Tangentbord: pil upp/ner (och Home/End) bläddrar, Enter eller mellanslag kryssar i eller ur, Esc stänger, och Tab går
// vidare. Ett klick utanför stänger. En skärmläsare får en rullista där flera kan väljas (aria-multiselectable).
function MultiOptionPicker({ values, onChange, options, emptyLabel, 'aria-label': ariaLabel }) {
  const listId = useId()
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useDismiss(rootRef, open, () => setOpen(false))

  // Den markerade raden ska synas när man bläddrar med pilarna.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function openList() {
    setActive(0)
    setOpen(true)
  }

  function toggle(index) {
    const { value } = options[index]
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])
  }

  function onKeyDown(event) {
    const last = options.length - 1
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return openList()
      setActive((a) => Math.min(Math.max(a + (event.key === 'ArrowDown' ? 1 : -1), 0), last))
    } else if (event.key === 'Home' || event.key === 'End') {
      if (!open) return
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : last)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) toggle(active)
      else openList()
    } else if (event.key === 'Escape' && open) {
      // Escape stänger bara listan, inte blocket runt den (MapPad lyssnar på Escape på hela sidan).
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  // På knappen: de valda i listans ordning.
  const chosen = options.filter((option) => values.includes(option.value)).map((option) => option.label)

  return (
    <div className="multi-option-picker" ref={rootRef}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className="multi-option-picker-button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="multi-option-picker-label">{chosen.length > 0 ? chosen.join(', ') : emptyLabel}</span>
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-multiselectable="true" className="multi-option-picker-list">
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={values.includes(option.value)}
              className={`multi-option-picker-option${index === active ? ' is-active' : ''}`}
              // mousedown i stället för click, så att knappen inte hinner tappa fokus innan valet görs.
              onMouseDown={(event) => {
                event.preventDefault()
                setActive(index)
                toggle(index)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="multi-option-picker-box" aria-hidden="true">
                {values.includes(option.value) ? '✓' : ''}
              </span>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MultiOptionPicker
