import InterestTags from './InterestTags'

// Valda intressen överst (klick tar bort), resten nedanför (klick lägger till).
// Komponenten sparar inget själv, det gör onAdd/onRemove hos föräldern.
function InterestPicker({ allInterests, selected, onAdd, onRemove }) {
  const selectedIds = new Set(selected.map((i) => i.id))
  const available = allInterests.filter((i) => !selectedIds.has(i.id))

  return (
    <div className="interest-picker">
      <h2 className="profile-label">Dina intressen</h2>
      {selected.length > 0 ? (
        <InterestTags interests={selected} onRemove={onRemove} />
      ) : (
        <p className="profile-hint">Inga valda än. Välj nedan.</p>
      )}

      {available.length > 0 && (
        <>
          <h2 className="profile-label">Lägg till</h2>
          <ul className="interest-tags">
            {available.map((interest) => (
              <li key={interest.id}>
                <button
                  type="button"
                  className="interest-tag"
                  onClick={() => onAdd(interest.id)}
                  aria-label={`Lägg till ${interest.name}`}
                >
                  <span aria-hidden="true">+</span>
                  {interest.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default InterestPicker
