import InterestTags from '../InterestTags'

export function memberCountText(count) {
  return `${count} ${count === 1 ? 'medlem' : 'medlemmar'}`
}

// T.ex. "3 medlemmar i Göteborg".
export function groupMembersText(group) {
  const members = memberCountText(group.member_count)
  return group.municipality_name ? `${members} i ${group.municipality_name}` : members
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
// "Avböj" visas bara om `onDecline` skickas med och man är inbjuden till klubben.
// `myInterestIds` (en Set) markerar intresset om det är ett av ens egna.
// `emptyAction` (valfri) är en knapp vidare under texten när listan är tom.
function GroupList({ groups, emptyText, emptyAction, myInterestIds, busy, onSelect, onJoin, onDecline }) {
  if (groups.length === 0) {
    return (
      <div className="content-stack">
        <p className="hint-text">{emptyText}</p>
        {emptyAction}
      </div>
    )
  }

  return (
    <div className="card-grid card-grid-compact">
      {groups.map((group) => (
        <article key={group.id} className="card card-interactive list-card">
          <button type="button" className="list-card-link" onClick={() => onSelect(group)}>
            <span className="card-title">{group.name}</span>
            {/* En rad, längre kortas med "…" (se .list-card-meta). */}
            <span className="card-subheading list-card-meta">
              {group.municipality_name} · {memberCountText(group.member_count)}
            </span>
            {group.description && <span className="card-text list-card-description">{group.description}</span>}
          </button>
          <InterestTags
            interests={[{ id: group.interest_id, name: group.interest_name, area: group.interest_area }]}
            highlight={myInterestIds}
          />
          <div className="card-actions">
            {group.is_member ? (
              <RoleBadge group={group} />
            ) : (
              <>
                <button type="button" className="primary-button button-small" disabled={busy} onClick={() => onJoin(group)}>
                  Gå med
                </button>
                {onDecline && group.is_invited && (
                  <button
                    type="button"
                    className="secondary-button button-small"
                    disabled={busy}
                    onClick={() => onDecline(group)}
                  >
                    Avböj
                  </button>
                )}
              </>
            )}
            {group.visibility === 'private' && <span className="status-pill">Privat</span>}
          </div>
        </article>
      ))}
    </div>
  )
}

export default GroupList
