import { useDesignChoice } from '../hooks/useDesignChoice'
import { MATCH_LEVELS } from '../services/matches'

// Så många av de fyra stjärnorna som är fyllda för varje nivå (utseendet "gnistor").
const STARS = { super: 4, strong: 3, good: 2, okay: 1 }

function Star({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.8 6.1 6.7.8-5 4.5 1.4 6.6L12 17.3l-5.9 3.3 1.4-6.6-5-4.5 6.7-.8z"
        fill={filled ? '#f4c430' : '#fff'}
        stroke="#3a2f25"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Nivån på en matchning (SUPERmatch, Stark match, Bra match eller Okej match) som en handritad stämpel i kortets övre hörn
// (se MatchCard). Nivån står alltid som text, och syns också i formen: streckad kant för Okej, skugga för Bra och Stark, och
// störst och vickande för SUPERmatch (bara för den som inte har stängt av animationer). Ingen siffra visas.
// `inline` ger en liten stämpel som står i flödet (på de små korten, se MatchThumb) i stället för i kortets hörn.
// TILLFÄLLIGT: i testläget kan man välja ett annat utseende i testpanelen (useDesignChoice('matchCard')): "gnistor"
// (stjärnor, och MatchCard sätter den under namnet) eller "tejp" (en remsa över kortets kant). Se devtools/matchCards.css.
function MatchLevel({ level, inline = false }) {
  const variant = useDesignChoice('matchCard')
  const label = MATCH_LEVELS[level]
  if (!label) return null

  if (!inline && variant === 'gnistor') {
    return (
      <span className={`match-sparks match-sparks-${level}`}>
        <span className="match-stars">
          {[1, 2, 3, 4].map((i) => (
            <Star key={i} filled={i <= STARS[level]} />
          ))}
        </span>
        <span className="match-sparks-label">{label}</span>
      </span>
    )
  }

  const tape = !inline && variant === 'tejp'
  return (
    <span className={`match-level match-level-${level}${inline ? ' match-level-inline' : ''}${tape ? ' match-level-tape' : ''}`}>
      {label}
    </span>
  )
}

export default MatchLevel
