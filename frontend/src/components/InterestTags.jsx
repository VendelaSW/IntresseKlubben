// Visar någons valda intressen som taggar, bara för visning (t.ex. på någon
// annans profil eller i personlistan). Ange `highlight` (en Set av
// intresse-id:n) för att markera vilka som är gemensamma med en själv -
// annars visas alla som markerade, som tidigare.
function InterestTags({ interests, highlight }) {
  return (
    <ul className="tags">
      {interests.map((interest) => {
        const shared = highlight ? highlight.has(interest.id) : true
        return (
          <li key={interest.id}>
            <span className={`tag tag-static${shared ? ' tag-selected' : ''}`}>{interest.name}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default InterestTags
