import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InvitePicker from '../events/InvitePicker'
import Modal from '../Modal'
import GroupEvents from './GroupEvents'
import GroupMembers from './GroupMembers'
import { RoleBadge, memberCountText } from './GroupList'
import { inviteToGroup } from '../../services/groups'

// Mer information om en grupp, med knapparna som passar ens roll. Medlemmar kan
// skapa ett event i klubben (öppnar eventformuläret med klubben vald), och "Gå ur"
// och "Radera" (för ägaren) ligger längst ner i kortet. "Bjud in" syns för den som
// får bjuda in (group.can_invite: ägaren, eller alla medlemmar om ägaren har slagit
// på det) och öppnar en popup med ens kontakter (`contacts`). Den som är inbjuden kan
// gå med eller avböja. Tillbaka-knappen ligger ovanför rutan, i GroupsPanel.
function GroupDetails({ group, contacts, busy, onJoin, onLeave, onDelete, onDecline }) {
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')

  async function handleInvite({ userIds }) {
    setInviteBusy(true)
    setInviteError('')
    try {
      const invited = await inviteToGroup(group.id, userIds)
      setInviteOpen(false)
      setInviteNotice(
        invited.length === 0
          ? 'Alla var redan inbjudna eller med.'
          : `Bjöd in ${invited.length} ${invited.length === 1 ? 'person' : 'personer'}.`,
      )
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviteBusy(false)
    }
  }

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
          <>
            <button type="button" className="primary-button" disabled={busy} onClick={() => onJoin(group)}>
              Gå med
            </button>
            {group.is_invited && (
              <button type="button" className="secondary-button" disabled={busy} onClick={() => onDecline(group)}>
                Avböj
              </button>
            )}
          </>
        )}
        {group.can_invite && (
          <button
            type="button"
            className="secondary-button button-small"
            onClick={() => {
              setInviteError('')
              setInviteNotice('')
              setInviteOpen(true)
            }}
          >
            Bjud in
          </button>
        )}
        {inviteNotice && <span className="status-success">{inviteNotice}</span>}
      </div>
      {inviteOpen && (
        <Modal title="Bjud in" onClose={() => setInviteOpen(false)}>
          <InvitePicker
            contacts={contacts}
            groups={[]}
            submitLabel="Bjud in"
            busy={inviteBusy}
            error={inviteError}
            onSubmit={handleInvite}
            onCancel={() => setInviteOpen(false)}
          />
        </Modal>
      )}
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
