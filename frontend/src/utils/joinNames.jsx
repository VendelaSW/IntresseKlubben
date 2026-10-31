// "A, B och C", med namnen i fetstil. Med `more` (det som står för resten, t.ex. en knapp "4 till") blir det
// "A, B, C och 4 till".
export function joinNames(names, more = null) {
  const parts = []
  names.forEach((name, i) => {
    if (i > 0) parts.push(i === names.length - 1 && !more ? ' och ' : ', ')
    parts.push(<strong key={i}>{name}</strong>)
  })
  if (more) parts.push(' och ', more)
  return parts
}
