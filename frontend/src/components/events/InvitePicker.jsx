import { useState } from 'react'
import { memberCountText } from '../groups/GroupList'

// Innehållet i popupen "Bjud in": en sökbar lista över ens kontakter och en lista
// över ens klubbar (alla medlemmar bjuds då in), med en kryssruta per rad.
// Kontakter visas med liten text och små avatarer (samma kompakta personlista som
// svarslistan). `initial` är det som redan var valt när popupen öppnades, och
// `onSubmit` får { usernames, groupIds }. Själva inbjudan skickas av föräldern.
function InvitePicker({ contacts, groups, initial, submitLabel, busy, error, onSubmit, onCancel }) {
  const [query, setQuery] = useState('')
  const [usernames, setUsernames] = useState(initial?.usernames ?? [])
  const [groupIds, setGroupIds] = useState(initial?.groupIds ?? [])

  const needle = query.trim().toLowerCase()
  const shown = contacts.filter((c) => `${c.name ?? ''} ${c.username}`.toLowerCase().includes(needle))
  const count = usernames.length + groupIds.length

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <>
      <div className="auth-form form-wide">
        <input
          type="search"
          aria-label="Sök bland kontakter"
          placeholder="Sök bland kontakter..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="modal-scroll">
        <div className="person-list person-list-compact">
          {contacts.length === 0 ? (
            <p className="hint-text">Du har inga kontakter än.</p>
          ) : shown.length === 0 ? (
            <p className="hint-text">Ingen kontakt matchar sökningen.</p>
          ) : (
            <ul>
              {shown.map((c) => (
                <li key={c.username}>
                  <label className="person-list-item">
                    <input
                      type="checkbox"
                      checked={usernames.includes(c.username)}
                      onChange={() => toggle(usernames, setUsernames, c.username)}
                    />
                    {c.image_url ? (
                      <img src={c.image_url} alt="" className="person-list-avatar" />
                    ) : (
                      <span className="person-list-avatar card-avatar-initials" aria-hidden="true">
                        {(c.name ?? c.username).trim()[0]?.toUpperCase()}
                      </span>
                    )}
                    <span>{c.name ?? c.username}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {groups.length > 0 && (
            <div>
              <p className="hint-text">Hela klubbar</p>
              <ul>
                {groups.map((g) => (
                  <li key={g.id}>
                    <label className="person-list-item">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(g.id)}
                        onChange={() => toggle(groupIds, setGroupIds, g.id)}
                      />
                      <span>{g.name}</span>
                      <span className="hint-text">{memberCountText(g.member_count)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {error && <p className="status-error">{error}</p>}

      <div className="card-actions">
        <button type="button" className="secondary-button button-small" onClick={onCancel}>
          Avbryt
        </button>
        <button
          type="button"
          className="primary-button button-small"
          disabled={busy || count === 0}
          onClick={() => onSubmit({ usernames, groupIds })}
        >
          {submitLabel}
          {count > 0 && ` (${count})`}
        </button>
      </div>
    </>
  )
}

export default InvitePicker
