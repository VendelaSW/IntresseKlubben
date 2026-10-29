import { MATCH_LEVELS } from '../services/matches'

// Nivån på en matchning (SUPERmatch, Stark match, Bra match eller Okej match) som en handritad stämpel i kortets övre hörn
// (se MatchCard). Nivån står alltid som text, och syns också i formen: streckad kant för Okej, skugga för Bra och Stark, och
// störst och vickande för SUPERmatch (bara för den som inte har stängt av animationer). Ingen siffra visas.
// `inline` ger en liten stämpel som står i flödet (på de små korten, se MatchThumb) i stället för i kortets hörn.
function MatchLevel({ level, inline = false }) {
  const label = MATCH_LEVELS[level]
  if (!label) return null
  return <span className={`match-level match-level-${level}${inline ? ' match-level-inline' : ''}`}>{label}</span>
}

export default MatchLevel
