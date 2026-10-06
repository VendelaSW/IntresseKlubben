import InterestTags from '../InterestTags'

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

// Ett kort per grupp, i samma rutnät som personkorten. Klick på kortet visar
// mer information. "Gå med" ligger utanför den klickbara delen, så att
// knapparna inte hamnar nästlade i varandra (samma upplägg som PersonCard).
// `myInterestIds` (en Set) markerar intresset om det är ett av ens egna.
function GroupList({ groups, emptyText, myInterestIds, busy, onSelect, onJoin }) {
  if (groups.length === 0) return <p className="hint-text">{emptyText}</p>

  return (
    <div className="card-grid card-grid-compact">
      {groups.map((group) => (
        <article key={group.id} className="card card-interactive group-card">
          <button type="button" className="group-card-link" onClick={() => onSelect(group)}>
            <span className="card-title">{group.name}</span>
            <span className="card-subheading">
              {group.municipality_name} · {memberCountText(group.member_count)}
            </span>
            {group.description && <span className="card-text group-card-description">{group.description}</span>}
          </button>
          <InterestTags
            interests={[{ id: group.interest_id, name: group.interest_name }]}
            highlight={myInterestIds}
          />
          <div className="card-actions">
            {group.is_member ? (
              <RoleBadge group={group} />
            ) : (
              <button type="button" className="primary-button button-small" disabled={busy} onClick={() => onJoin(group)}>
                Gå med
              </button>
            )}
            {group.visibility === 'private' && <span className="status-pill">Privat</span>}
          </div>
        </article>
      ))}
    </div>
  )
}

export default GroupList
