// Initialerna i ett namn, högst `max` bokstäver ("Anna Berg" → "AB" med max 2).
// "?" om namnet saknas.
export function initials(name, max = 1) {
  if (!name?.trim()) return '?'
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, max)
    .toUpperCase()
}

// En persons avatar: profilbilden, eller initialerna i en blå cirkel om bild
// saknas. Samma överallt i appen. `className` ger storleken, t.ex.
// "person-list-avatar" (liten, i listor) eller "card-avatar" (på kort).
// Dekoration: namnet står alltid bredvid, så den läses inte upp.
function Avatar({ name, imageUrl, className, maxLetters = 1 }) {
  if (imageUrl) return <img src={imageUrl} alt="" className={className} />
  return (
    <span className={`${className} card-avatar-initials`} aria-hidden="true">
      {initials(name, maxLetters)}
    </span>
  )
}

export default Avatar
