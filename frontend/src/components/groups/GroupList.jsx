import klubbarIcon from '../../assets/klubbar.png'
import './clubCardVariants.css'
import EmptyState from '../EmptyState'
import InterestTags from '../InterestTags'
import { PRE_DEV, useDesignChoice } from '../../hooks/useDesignChoice'

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
// TILLFÄLLIGT: i testläget kan man välja en av sex nya kortstilar (useDesignChoice('clubCard'), se ClubCards).
function GroupList({ groups, emptyText, emptyAction, myInterestIds, busy, onSelect, onJoin, onDecline }) {
  const cardStyle = useDesignChoice('clubCard')

  if (groups.length === 0) {
    return <EmptyState text={emptyText}>{emptyAction}</EmptyState>
  }

  if (cardStyle !== PRE_DEV) {
    return (
      <ClubCards
        style={cardStyle}
        groups={groups}
        myInterestIds={myInterestIds}
        busy={busy}
        onSelect={onSelect}
        onJoin={onJoin}
        onDecline={onDecline}
      />
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

// TILLFÄLLIGT, bara i testläget: klubbkorten i en av sex nya stilar att jämföra (style '1'–'6', se
// clubCardVariants.css). Mjuk färg efter klubbens id, så att korten skiljer sig åt men en klubb alltid har samma
// färg. Klubbikonen och om klubben är öppen eller privat, namnet, hur många och var, beskrivningen och intresset,
// och nertill ens roll (Ägare eller Medlem) eller Gå med (och Avböj), och en pil. Hela kortet (och pilen) öppnar
// klubbens vy; Gå med och Avböj ligger utanför den klickbara delen.
const TONES = ['green', 'peach', 'blue', 'yellow', 'lilac', 'rose']

function ClubCards({ style, groups, myInterestIds, busy, onSelect, onJoin, onDecline }) {
  return (
    <div className={`card-grid card-grid-compact club-grid club-style-${style}`}>
      {groups.map((group) => (
        <article key={group.id} className={`card card-interactive list-card club-card club-card-${TONES[group.id % TONES.length]}`}>
          {/* Öppen eller privat, uppe i högra hörnet mitt emot ikonen. */}
          <span className={`club-card-visibility${group.visibility === 'private' ? ' is-private' : ' is-open'}`}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d={group.visibility === 'private' ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.9-.9'} />
            </svg>
            {group.visibility === 'private' ? 'Privat' : 'Öppen'}
          </span>
          <button type="button" className="list-card-link" onClick={() => onSelect(group)}>
            <img src={klubbarIcon} alt="" className="club-card-icon" />
            <span className="card-title">{group.name}</span>
            <span className="club-card-meta">{groupMembersText(group)}</span>
            {group.description && <span className="card-text list-card-description">{group.description}</span>}
          </button>
          <InterestTags
            interests={[{ id: group.interest_id, name: group.interest_name, area: group.interest_area }]}
            highlight={myInterestIds}
          />
          <div className="club-card-foot">
            {group.is_member ? (
              <span className="club-card-role">{group.is_owner ? 'Ägare' : 'Medlem'}</span>
            ) : (
              <span className="club-card-buttons">
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
              </span>
            )}
            {/* Pilen öppnar också klubben (samma som kortet), därför inte i tabbordningen. */}
            <button type="button" className="club-card-open" tabIndex={-1} aria-hidden="true" onClick={() => onSelect(group)}>
              {/* En handritad pil, lite ojämn. */}
              <svg viewBox="0 0 16 16" width="18" height="18">
                <path
                  d="M3.5 12.6 C6 10.3 8.8 7.4 12.2 3.9 M6.6 3.7 C8.6 4 10.4 3.8 12.3 3.6 C12.1 5.6 12.4 7.6 12.2 9.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

export default GroupList
