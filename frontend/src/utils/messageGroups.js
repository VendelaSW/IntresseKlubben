// Meddelanden i följd från samma person visas tillsammans, under ett namn och
// en bild (brevtråden och klubbchatten). En ny grupp börjar när någon annan
// skriver, eller när det har gått mer än GROUP_GAP_MS sedan förra meddelandet.
export const GROUP_GAP_MS = 5 * 60 * 1000

// Börjar meddelandet på plats `index` en ny grupp? `messages` är äldst först
// och har sender_id och created_at, som i API:t.
export function startsGroup(messages, index) {
  if (index === 0) return true
  const previous = messages[index - 1]
  const current = messages[index]
  if (previous.sender_id !== current.sender_id) return true
  return new Date(current.created_at) - new Date(previous.created_at) > GROUP_GAP_MS
}
