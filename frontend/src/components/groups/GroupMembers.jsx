import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../Avatar'
import { useConfirm } from '../../hooks/useConfirm'
import { getGroupMembers, removeGroupMember, setGroupMemberRole } from '../../services/groups'
import LoadError, { useRetry } from '../LoadError'

const ROLE_LABELS = { owner: 'Ägare', admin: 'Admin' }

// Vilka som är med i klubben. Varje namn länkar till personens profil, där
// man kan skicka kompisförfrågan eller meddelande. `memberCount` gör att listan
// hämtas om när någon går med eller går ur.
//
// Roller (SCRUM-160): ägaren kan göra en medlem till administratör och ta
// tillbaka det, och ägaren och administratörer kan ta bort medlemmar (en
// administratör bara vanliga medlemmar). Knapparna syns bara för den som får
// använda dem (`group.is_owner`, `group.is_admin`). `onChanged` anropas när
// någon har tagits bort, så att klubbens antal medlemmar stämmer.
function GroupMembers({ group, onChanged }) {
  const confirm = useConfirm()
  const [members, setMembers] = useState(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [attempt, retry] = useRetry()

  useEffect(() => {
    setFailed(false)
    getGroupMembers(group.id)
      .then(setMembers)
      .catch(() => setFailed(true))
  }, [group.id, group.member_count, attempt])

  async function run(userId, action) {
    setBusyId(userId)
    setError('')
    try {
      await action()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function changeRole(member, role) {
    if (await run(member.id, () => setGroupMemberRole(group.id, member.id, role))) {
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, role } : m)))
    }
  }

  async function remove(member) {
    const name = member.name ?? member.username
    if (
      !(await confirm({
        title: `Ta bort ${name}`,
        text: `${name} tas bort ur klubben och får en notis om det.`,
        confirmLabel: 'Ta bort',
        danger: true,
      }))
    )
      return
    if (await run(member.id, () => removeGroupMember(group.id, member.id))) {
      setMembers((list) => list.filter((m) => m.id !== member.id))
      onChanged?.()
    }
  }

  if (failed) return <LoadError text="Kunde inte hämta medlemmarna." onRetry={retry} className="hint-text" />
  if (members === null) return <p className="hint-text">Laddar medlemmar...</p>

  return (
    <div className="person-list person-list-compact group-members">
      <p className="card-subheading">Medlemmar</p>
      <ul>
        {members.map((m) => {
          const canSetRole = group.is_owner && m.role !== 'owner'
          const canRemove = m.role !== 'owner' && (group.is_owner || (group.is_admin && m.role === 'member'))
          return (
            <li key={m.id} className={canSetRole || canRemove ? 'group-member-managed' : undefined}>
              <Link to={`/anvandare/${m.id}`} className="person-list-item">
                <Avatar name={m.name ?? m.username} imageUrl={m.image_url} className="person-list-avatar" />
                <span>{m.name ?? m.username}</span>
                {ROLE_LABELS[m.role] && <span className="hint-text">{ROLE_LABELS[m.role]}</span>}
              </Link>
              {(canSetRole || canRemove) && (
                <span className="group-member-actions">
                  {canSetRole && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busyId !== null}
                      onClick={() => changeRole(m, m.role === 'admin' ? 'member' : 'admin')}
                    >
                      {m.role === 'admin' ? 'Ta bort admin' : 'Gör till admin'}
                    </button>
                  )}
                  {canRemove && (
                    <button type="button" className="text-button" disabled={busyId !== null} onClick={() => remove(m)}>
                      Ta bort
                    </button>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="status-error">{error}</p>}
    </div>
  )
}

export default GroupMembers
