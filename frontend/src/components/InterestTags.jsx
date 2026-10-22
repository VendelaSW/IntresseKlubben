import InterestTagGroup, { groupInterests } from './InterestTagGroup'

// Någons intressen som taggar, bara för visning (personkort, events och klubbar).
// `interests` är [{ id, name, parent_id, area }]; ett intresse vars förälder också
// finns med visas som ett underintresse till den (▼, se InterestTagGroup).
// `highlight` (en Set av intresse-id:n) markerar de som är gemensamma med en
// själv; utan den markeras inga. `children` läggs sist i raden, t.ex. en knapp
// som visar fler, och `listRef` pekar på listan (för att mäta den, se PersonCard).
// `groups` kan skickas i stället för `interests`, redan grupperade (PersonCard
// visar bara de som får plats).
function InterestTags({ interests, groups = groupInterests(interests ?? []), highlight, children, listRef }) {
  return (
    <ul className="interest-tags" ref={listRef}>
      {groups.map((group) => (
        <InterestTagGroup key={group.key} group={group} isShared={highlight && ((id) => highlight.has(id))} />
      ))}
      {children && <li>{children}</li>}
    </ul>
  )
}

export default InterestTags
