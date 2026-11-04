import { useRef } from 'react'

// Sökfältet, samma i hela appen (SCRUM-310): förstoringsglas, platshållartext och ett kryss som tömmer fältet när
// det står något i det. Allt utom `onClear` och `className` går vidare till <input>. `aria-label` behövs, eftersom
// platshållartexten inte läses upp överallt.
function SearchField({ value, onClear, className = '', ...inputProps }) {
  const inputRef = useRef(null)
  return (
    <div className={`search-field${className ? ` ${className}` : ''}`} onClick={() => inputRef.current.focus()}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13 13 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input ref={inputRef} type="search" value={value} {...inputProps} />
      {value !== '' && (
        <button
          type="button"
          className="search-field-clear"
          aria-label="Töm sökfältet"
          // mousedown, inte bara click: annars tappar fältet fokus först, och en lista under det hinner stängas.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            onClear()
            inputRef.current.focus()
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export default SearchField
