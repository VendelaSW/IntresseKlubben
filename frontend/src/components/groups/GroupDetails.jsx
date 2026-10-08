import { useNavigate } from 'react-router-dom'
import GroupEvents from './GroupEvents'
import GroupMembers from './GroupMembers'
import { RoleBadge, memberCountText } from './GroupList'

// Mer information om en grupp, med knapparna som passar ens roll. Medlemmar kan
// skapa ett event i klubben (öppnar eventformuläret med klubben vald), och "Gå ur"
// och "Radera" (för ägaren) ligger längst ner i kortet. Tillbaka-knappen ligger
// ovanför rutan, i GroupsPanel.
function GroupDetails({ group, busy, onJoin, onLeave, onDelete }) {
  const navigate = useNavigate()
  return (
    <section className="detail-view">
      <p className="card-title">{group.name}</p>
      <p className="card-subheading">
        {group.municipality_name} · {memberCountText(group.member_count)}
      </p>
      {group.is_member && group.has_blocked_member && (
        <p className="soft-box soft-box-wide soft-box-text">Någon du har blockerat är med i den här klubben.</p>
      )}
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
          <button
            type="button"
            className="secondary-button button-small"
            onClick={() => navigate(`/events?skapa=1&klubb=${group.id}`)}
          >
            Skapa event
          </button>
        ) : (
          <button type="button" className="primary-button" disabled={busy} onClick={() => onJoin(group)}>
            Gå med
          </button>
        )}
      </div>
      <GroupEvents groupId={group.id} />
      <GroupMembers groupId={group.id} memberCount={group.member_count} />
      {group.is_member && (
        <div className="card-actions">
          <button type="button" className="secondary-button button-small" disabled={busy} onClick={() => onLeave(group)}>
            Gå ur
          </button>
          {group.is_owner && (
            <button type="button" className="secondary-button button-small" disabled={busy} onClick={() => onDelete(group)}>
              Radera
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export default GroupDetails
