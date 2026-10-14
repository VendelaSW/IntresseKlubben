// Visar någons valda intressen som taggar, bara för visning (t.ex. på någon
// annans profil eller i personlistan). Ange `highlight` (en Set av
// intresse-id:n) för att markera vilka som är gemensamma med en själv -
// annars visas alla som markerade, som tidigare. Med `label` blir listan en
// egen ruta som går att nå med tangentbordet (t.ex. när den scrollar på
// personkorten), och läses upp med den texten.
function InterestTags({ interests, highlight, label }) {
  return (
    <ul className="tags" tabIndex={label ? 0 : undefined} aria-label={label}>
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
