// Visar någons valda intressen som gula taggar, bara för visning
// (t.ex. på någon annans profil).
function InterestTags({ interests }) {
  return (
    <ul className="tags">
      {interests.map((interest) => (
        <li key={interest.id}>
          <span className="tag tag-selected">{interest.name}</span>
        </li>
      ))}
    </ul>
  )
}

export default InterestTags
