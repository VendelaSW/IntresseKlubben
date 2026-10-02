export function memberCountText(count) {
  return `${count} ${count === 1 ? 'medlem' : 'medlemmar'}`
}

// Mörk för ägare, grön för medlem, så att de är lätta att skilja åt.
export function RoleBadge({ group }) {
  if (!group.is_member) return null
  return group.is_owner ? (
    <span className="status-pill status-pill-owner">Ägare</span>
  ) : (
    <span className="status-pill status-pill-success">Medlem</span>
  )
}

// Kompakt lista: en rad per grupp. Klick på en rad visar mer information.
function GroupList({ groups, emptyText, onSelect }) {
  if (groups.length === 0) return <p className="hint-text">{emptyText}</p>

  return (
    <ul className="group-list">
      {groups.map((group) => (
        <li key={group.id}>
          <button type="button" className="group-row" onClick={() => onSelect(group)}>
            <span className="group-row-name">{group.name}</span>
            <span className="group-row-meta">
              {group.interest_name} · {group.municipality_name} · {memberCountText(group.member_count)}
            </span>
            <RoleBadge group={group} />
          </button>
        </li>
      ))}
    </ul>
  )
}

export default GroupList
