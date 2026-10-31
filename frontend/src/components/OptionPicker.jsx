import { useEffect, useId, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'

// En egen rullista för ett val bland några alternativ, i stället för en vanlig <select>. Den öppnade listan i en <select> ritas av
// webbläsaren eller operativsystemet och går inte att färga (blå markering), men den här listan är vanliga HTML-element
// (.option-picker-list), så valen får appens gula färg. Fungerar som en <select>: `value` är det valda alternativets värde
// och `onChange` får det nya. `options` är [{ value, label }]. Samma uppbyggnad som MunicipalityPicker, utan att man skriver.
//
// Tangentbord: pil upp/ner (och Home/End) bläddrar, Enter eller mellanslag väljer, Esc stänger, och en bokstav hoppar till nästa
// alternativ som börjar på den. Ett klick utanför stänger. En skärmläsare får en rullista (role="combobox" med en listbox).
function OptionPicker({ id, value, onChange, options, 'aria-label': ariaLabel }) {
  const listId = useId()
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  )
  const selected = options[selectedIndex]

  useDismiss(rootRef, open, () => setOpen(false))

  // Den markerade raden ska synas när man bläddrar med pilarna.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function openList() {
    setActive(selectedIndex)
    setOpen(true)
  }

  function pick(index) {
    setOpen(false)
    if (options[index].value !== value) onChange(options[index].value)
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
      if (open) pick(active)
      else openList()
    } else if (event.key === 'Tab') {
      setOpen(false)
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // En bokstav: nästa alternativ (efter det markerade, sedan från början) som börjar på den.
      const letter = event.key.toLocaleLowerCase('sv')
      const from = open ? active : selectedIndex
      const order = [...options.keys()].map((i) => (from + 1 + i) % options.length)
      const found = order.find((i) => options[i].label.toLocaleLowerCase('sv').startsWith(letter))
      if (found !== undefined) {
        if (open) setActive(found)
        else if (options[found].value !== value) onChange(options[found].value)
      }
    }
  }

  return (
    <div className="option-picker" ref={rootRef}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className="option-picker-button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="option-picker-label">{selected?.label}</span>
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="option-picker-list">
          {options.map((option, index) => (
            <li
              key={option.value || 'tom'}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`option-picker-option${index === active ? ' is-active' : ''}`}
              // mousedown i stället för click, så att knappen inte hinner tappa fokus innan valet görs.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(index)
              }}
              onMouseEnter={() => setActive(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default OptionPicker
