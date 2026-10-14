// Visar någons valda intressen som taggar, bara för visning (t.ex. på någon
// annans profil eller i personlistan). Ange `highlight` (en Set av
// intresse-id:n) för att markera vilka som är gemensamma med en själv -
// annars visas alla som markerade, som tidigare. `children` läggs sist i
// raden, t.ex. en knapp som visar fler, och `listRef` pekar på listan (för
// att mäta den, se PersonCard).
function InterestTags({ interests, highlight, children, listRef }) {
  return (
    <ul className="tags" ref={listRef}>
      {interests.map((interest) => {
        const shared = highlight ? highlight.has(interest.id) : true
        return (
          <li key={interest.id}>
            <span className={`tag tag-static${shared ? ' tag-selected' : ''}`}>{interest.name}</span>
          </li>
        )
      })}
      {children && <li>{children}</li>}
    </ul>
  )
}

export default InterestTags
