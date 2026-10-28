import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InvitePicker from '../events/InvitePicker'
import InterestTags from '../InterestTags'
import Modal from '../Modal'
import ShowOnMapButton from '../ShowOnMapButton'
import GroupEvents from './GroupEvents'
import GroupJoinRequests from './GroupJoinRequests'
import GroupMembers from './GroupMembers'
import { RoleBadge, groupMembersText } from './GroupList'
import { inviteToGroup, skillLevelLabel } from '../../services/groups'

// Mer information om en grupp, med knapparna som passar ens roll. Medlemmar kan
// öppna anslagstavlan (`onOpenBoard`) och skapa ett event i klubben (öppnar
// eventformuläret med klubben vald), och "Gå ur"
// och "Radera" (för ägaren) ligger längst ner i kortet. "Bjud in" syns för den som
// får bjuda in (group.can_invite: ägaren, eller alla medlemmar om ägaren har slagit
// på det) och öppnar en popup med ens kompisar (`contacts`). Den som är inbjuden kan
// gå med eller avböja. Tillbaka-knappen ligger ovanför rutan, i GroupsPanel.
// En klubb man ansöker till (SCRUM-159) har "Ansök" i stället för "Gå med", med ett
// valfritt meddelande till ägaren (`onApply(group, message)`), och "Ta tillbaka"
// (`onWithdraw`) medan ansökan väntar. Ägaren svarar på ansökningarna i
// GroupJoinRequests, och `onMembersChanged` hämtar om klubben när någon har
// godkänts. En full klubb (SCRUM-216) går inte att gå med i.
function GroupDetails({
  group,
  contacts,
  busy,
  onJoin,
  onApply,
  onWithdraw,
  onMembersChanged,
  onLeave,
  onDelete,
  onDecline,
  onOpenBoard,
}) {
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyMessage, setApplyMessage] = useState('')
  const mustApply = group.visibility === 'application' && !group.is_invited
  const skillLevel = skillLevelLabel(group.skill_level)

  async function handleApply(event) {
    event.preventDefault()
    if (await onApply(group, applyMessage)) {
      setApplyOpen(false)
      setApplyMessage('')
    }
  }

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
      {/* Klubben till vänster, events och medlemmar till höger när rutan är bred (se .detail-sheet). */}
      <div className="detail-main">
        <p className="card-title">{group.name}</p>
        <p className="card-subheading">
          {groupMembersText(group)}
        </p>
        {/* Beskrivningen högt upp, direkt efter kommun och medlemmar, så att man ser
            vad klubben handlar om. Träffar och träffplats kommer efter. */}
        <p className="card-text">{group.description}</p>
        {group.meeting_info && <p className="hint-text">Träffas: {group.meeting_info}</p>}
        {(group.place_name || group.address) && (
          <p className="hint-text">Träffplats: {[group.place_name, group.address].filter(Boolean).join(', ')}</p>
        )}
        <ShowOnMapButton type="klubb" id={group.id} data={group} />
        {group.is_member && group.has_blocked_member && (
          <p className="soft-box soft-box-wide soft-box-text">Någon du har blockerat är med i den här klubben.</p>
        )}
        <InterestTags interests={[{ id: group.interest_id, name: group.interest_name, area_slug: group.interest_area_slug }]} />
        <div className="card-actions">
          <RoleBadge group={group} />
          {group.visibility === 'private' && <span className="status-pill">Privat</span>}
          {group.visibility === 'application' && <span className="status-pill">Ansökan</span>}
          {skillLevel && <span className="status-pill">Nivå: {skillLevel}</span>}
          {group.is_full && <span className="status-pill">Full</span>}
        </div>
        <div className="card-actions">
          {group.is_member ? (
            <>
              <button type="button" className="secondary-button button-small" onClick={onOpenBoard}>
                Anslagstavla
              </button>
              <button
                type="button"
                className="secondary-button button-small"
                onClick={() => navigate(`/events?skapa=1&klubb=${group.id}`)}
              >
                Skapa event
              </button>
            </>
          ) : (
            <>
              {group.is_full ? (
                <p className="hint-text">Klubben är full.</p>
              ) : mustApply && group.has_applied ? (
                <>
                  <span className="status-pill status-pill-success">Ansökan skickad</span>
                  <button type="button" className="secondary-button button-small" disabled={busy} onClick={() => onWithdraw(group)}>
                    Ta tillbaka
                  </button>
                </>
              ) : mustApply ? (
                <button type="button" className="primary-button" disabled={busy} onClick={() => setApplyOpen(true)}>
                  Ansök
                </button>
              ) : (
                <button type="button" className="primary-button" disabled={busy} onClick={() => onJoin(group)}>
                  Gå med
                </button>
              )}
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
        {applyOpen && (
          <Modal title={`Ansök till ${group.name}`} onClose={() => setApplyOpen(false)}>
            <form className="auth-form" onSubmit={handleApply}>
              <label htmlFor="apply-message">Meddelande till ägaren (valfritt)</label>
              <textarea
                id="apply-message"
                rows={3}
                maxLength={200}
                value={applyMessage}
                onChange={(e) => setApplyMessage(e.target.value)}
                placeholder="T.ex. vad du gillar med intresset"
              />
              <p className="hint-text">Ägaren får en notis och svarar på din ansökan.</p>
              <div className="form-actions">
                <button type="submit" disabled={busy}>
                  {busy ? 'Skickar...' : 'Skicka ansökan'}
                </button>
                <button type="button" className="button-secondary" onClick={() => setApplyOpen(false)}>
                  Avbryt
                </button>
              </div>
            </form>
          </Modal>
        )}
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
      </div>
      <div className="detail-aside">
        {(group.is_owner || group.is_admin) && group.visibility === 'application' && (
          <GroupJoinRequests group={group} onChanged={onMembersChanged} />
        )}
        <GroupEvents groupId={group.id} />
        <GroupMembers group={group} onChanged={onMembersChanged} />
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
      </div>
    </section>
  )
}

export default GroupDetails
