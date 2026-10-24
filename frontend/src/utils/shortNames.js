// Korta namn till en lista personer, t.ex. kuverten i Brev, där hela namnet inte får plats ("Maximiliana Augusta von
// Ekenstam-Lindqvist" blir "Maximiliana"). Förnamnet räcker så länge ingen annan i listan har samma. Finns det två
// Filip blir de "Filip S." och "Filip A." (efternamnets första bokstav), och räcker inte det heller visas hela
// namnen. `people` är [{ id, name, username }]; svaret är en Map från id till namnet som ska visas.
export function shortNames(people) {
  const full = (p) => (p.name ?? p.username ?? '').trim()
  const first = (p) => full(p).split(/\s+/)[0]
  // "Filip S." bara när efternamnet börjar med en bokstav, annars (t.ex. "Testperson 1") hela namnet.
  const withInitial = (p) => {
    const parts = full(p).split(/\s+/)
    const last = parts.at(-1)
    return parts.length > 1 && /^\p{L}/u.test(last) ? `${parts[0]} ${last[0].toUpperCase()}.` : full(p)
  }

  const count = (names) => names.reduce((counts, n) => counts.set(n, (counts.get(n) ?? 0) + 1), new Map())
  const firstCounts = count(people.map(first))
  const initialCounts = count(people.map(withInitial))

  return new Map(
    people.map((p) => {
      if (firstCounts.get(first(p)) === 1) return [p.id, first(p)]
      if (initialCounts.get(withInitial(p)) === 1) return [p.id, withInitial(p)]
      return [p.id, full(p)]
    }),
  )
}
