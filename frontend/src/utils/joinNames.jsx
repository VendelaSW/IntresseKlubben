// "A, B och C", med namnen i fetstil. Med `more` (fler som inte skrivs ut) blir det "A, B, C och 4 till".
export function joinNames(names, more = 0) {
  const parts = []
  names.forEach((name, i) => {
    if (i > 0) parts.push(i === names.length - 1 && !more ? ' och ' : ', ')
    parts.push(<strong key={i}>{name}</strong>)
  })
  if (more) parts.push(` och ${more} till`)
  return parts
}
