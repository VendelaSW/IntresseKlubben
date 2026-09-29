// Visar intressen som gula taggar. Utan onRemove är taggarna bara för
// visning (t.ex. på någon annans profil), med onRemove får de ett ×.
function InterestTags({ interests, onRemove }) {
  return (
    <ul className="interest-tags">
      {interests.map((interest) => (
        <li key={interest.id}>
          {onRemove ? (
            <button
              type="button"
              className="interest-tag interest-tag-selected"
              onClick={() => onRemove(interest.id)}
              aria-label={`Ta bort ${interest.name}`}
            >
              {interest.name}
              <span aria-hidden="true">×</span>
            </button>
          ) : (
            <span className="interest-tag interest-tag-selected">{interest.name}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export default InterestTags
