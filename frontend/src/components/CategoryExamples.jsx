const EXAMPLE_CATEGORIES = [
  'Dykning',
  'Keramik',
  'Fotboll',
  'Resa',
  'Brädspel',
  'Katter',
]

function CategoryExamples() {
  return (
    <section>
      <p>Exempel på intressen:</p>
      <ul>
        {EXAMPLE_CATEGORIES.map((category) => (
          <li key={category}>{category}</li>
        ))}
      </ul>
    </section>
  )
}

export default CategoryExamples
