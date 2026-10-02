import GroupMembers from './GroupMembers'
import { RoleBadge, memberCountText } from './GroupList'

// Mer information om en grupp, med knapparna som passar ens roll.
function GroupDetails({ group, busy, onJoin, onLeave, onDelete, onBack }) {
  return (
    <section className="group-details">
      <button type="button" className="secondary-button button-small" onClick={onBack}>
        ← Tillbaka
      </button>
      <p className="card-title">{group.name}</p>
      <p className="card-subheading">
        {group.municipality_name} · {memberCountText(group.member_count)}
      </p>
      <p className="card-text">{group.description}</p>
      {group.meeting_info && <p className="hint-text">Träffas: {group.meeting_info}</p>}
      <ul className="tags">
        <li>
          <span className="tag tag-selected tag-static">{group.interest_name}</span>
        </li>
      </ul>
      <div className="card-actions">
        <RoleBadge group={group} />
        {group.visibility === 'private' && <span className="status-pill">Privat</span>}
      </div>
      <div className="card-actions">
        {group.is_member ? (
          <>
            <button type="button" className="secondary-button button-small" disabled={busy} onClick={() => onLeave(group)}>
              Gå ur
            </button>
            {group.is_owner && (
              <button type="button" className="secondary-button button-small" disabled={busy} onClick={() => onDelete(group)}>
                Radera
              </button>
            )}
          </>
        ) : (
          <button type="button" className="primary-button" disabled={busy} onClick={() => onJoin(group)}>
            Gå med
          </button>
        )}
      </div>
      <GroupMembers groupId={group.id} memberCount={group.member_count} />
    </section>
  )
}

export default GroupDetails
