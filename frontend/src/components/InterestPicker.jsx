// Alla intressen som taggar enligt stilguiden: kontur = ej vald, gul = vald.
// Klick växlar. Komponenten sparar inget själv, det gör onToggle hos föräldern.
function InterestPicker({ allInterests, selected, onToggle }) {
  const selectedIds = new Set(selected.map((i) => i.id))

  return (
    <ul className="tags">
      {allInterests.map((interest) => {
        const isSelected = selectedIds.has(interest.id)
        return (
          <li key={interest.id}>
            <button
              type="button"
              className={`tag${isSelected ? ' tag-selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onToggle(interest.id, !isSelected)}
            >
              {interest.name}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default InterestPicker
