import klubbarIcon from '../../assets/klubbar.png'
import './clubCardVariants.css'
import EmptyState from '../EmptyState'
import InterestTags from '../InterestTags'
import { PRE_DEV, useDesignChoice } from '../../hooks/useDesignChoice'
import { areaColors } from '../../utils/interestColors'

export function memberCountText(count) {
  return `${count} ${count === 1 ? 'medlem' : 'medlemmar'}`
}

// Bara antalet, utan var: "3 medlemmar", eller "3 av 10 medlemmar" med max antal.
export function groupCountText(group) {
  return group.max_members ? `${group.member_count} av ${memberCountText(group.max_members)}` : memberCountText(group.member_count)
}

// T.ex. "3 medlemmar i Göteborg", "12 medlemmar i Norrland" eller "5 medlemmar i hela Sverige"
// (klubbens område, SCRUM-282). Med max antal: "3 av 10 medlemmar i Göteborg".
export function groupMembersText(group) {
  const count = groupCountText(group)
  const area = group.scope === 'country' ? 'hela Sverige' : (group.scope_name ?? group.municipality_name)
  return area ? `${count} i ${area}` : count
}

// Knappen på ett kort för den som inte är med: Gå med, eller Ansök för en klubb
// man ansöker till (öppnar klubben, där man kan skriva till ägaren), eller att
// man redan har ansökt eller att klubben är full (SCRUM-159, SCRUM-216).
export function JoinCardButton({ group, busy, onJoin, onSelect }) {
  if (group.is_full) return <span className="status-pill">Full</span>
  if (group.visibility === 'application' && !group.is_invited) {
    if (group.has_applied) return <span className="status-pill">Ansökt</span>
    return (
      <button type="button" className="primary-button button-small" onClick={() => onSelect(group)}>
        Ansök
      </button>
    )
  }
  return (
    <button type="button" className="primary-button button-small" disabled={busy} onClick={() => onJoin(group)}>
      Gå med
    </button>
  )
}

// Mörk för ägare, grön för medlem, så att de är lätta att skilja åt. En
// administratör (SCRUM-160) är också mörk.
export function RoleBadge({ group }) {
  if (!group.is_member) return null
  if (group.is_owner) return <span className="status-pill status-pill-owner">Ägare</span>
  if (group.is_admin) return <span className="status-pill status-pill-owner">Admin</span>
  return <span className="status-pill status-pill-success">Medlem</span>
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
              {group.scope_name ?? group.municipality_name} · {memberCountText(group.member_count)}
            </span>
            {group.description && <span className="card-text list-card-description">{group.description}</span>}
          </button>
          <InterestTags
            interests={[{ id: group.interest_id, name: group.interest_name, area_slug: group.interest_area_slug }]}
            highlight={myInterestIds}
          />
          <div className="card-actions">
            {group.is_member ? (
              <RoleBadge group={group} />
            ) : (
              <>
                <JoinCardButton group={group} busy={busy} onJoin={onJoin} onSelect={onSelect} />
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
    // Variant 7 (Affisch, Nicklas variant) bygger på 5 (Affisch) och ändrar några saker, se clubCardVariants.css.
    <div className={`card-grid card-grid-compact club-grid club-style-${style}${style === '7' ? ' club-style-5' : ''}`}>
      {groups.map((group) => (
        <article
          key={group.id}
          className={`card card-interactive list-card club-card club-card-${TONES[group.id % TONES.length]}`}
          // Variant 7: den färgade raden överst har intressets färg (samma som taggen).
          style={style === '7' ? { '--poster': areaColors(group.interest_area_slug)['--tag-fill'] } : undefined}
        >
          {/* Variant 7: "KLUBB" uppe till vänster i små tryckta versaler, som "EVENT" på eventbiljetten (eventCardVariants.css). */}
          {style === '7' && (
            <span className="club-card-kind" aria-hidden="true">
              Klubb
            </span>
          )}
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
            {/* Variant 7 visar bara antalet, utan var. */}
            <span className="club-card-meta">{style === '7' ? groupCountText(group) : groupMembersText(group)}</span>
            {group.description && <span className="card-text list-card-description">{group.description}</span>}
          </button>
          <InterestTags
            interests={[{ id: group.interest_id, name: group.interest_name, area_slug: group.interest_area_slug }]}
            highlight={myInterestIds}
          />
          <div className="club-card-foot">
            {group.is_member ? (
              <span className="club-card-role">{group.is_owner ? 'Ägare' : group.is_admin ? 'Admin' : 'Medlem'}</span>
            ) : (
              <span className="club-card-buttons">
                <JoinCardButton group={group} busy={busy} onJoin={onJoin} onSelect={onSelect} />
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
            {/* Variant 7: klubbikonen som en stämpel i hörnet, där pilen annars sitter (pilen döljs i CSS). */}
            {style === '7' && <img src={klubbarIcon} alt="" className="club-card-stamp" />}
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
