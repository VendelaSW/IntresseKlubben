// Ett litet antal med − och + på var sida, t.ex. max antal medlemmar. Man kan också
// skriva siffran direkt. Tomt ('') betyder inget antal (t.ex. ingen gräns): + från
// tomt börjar på `start` (annars `min`), och − från `min` tömmer fältet igen.
// `value` är en sträng, som i ett vanligt fält, och `onChange(next)` får den nya.
function NumberStepper({ id, value, onChange, min = 1, max = 1000, step = 1, start = min }) {
  const number = value === '' ? null : Number(value)

  function decrease() {
    if (number === null) return
    onChange(number <= min ? '' : String(Math.max(min, number - step)))
  }

  function increase() {
    onChange(String(number === null ? start : Math.min(max, number + step)))
  }

  return (
    <div className="number-stepper">
      <button type="button" onClick={decrease} disabled={number === null} aria-label="Färre">
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        // Bara siffror, och aldrig mer än `max`.
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          onChange(digits === '' ? '' : String(Math.min(max, Number(digits))))
        }}
        // En för liten siffra blir `min` när man lämnar fältet (2 för en klubb, inte 0 eller 1).
        onBlur={() => number !== null && number < min && onChange(String(min))}
      />
      <button type="button" onClick={increase} disabled={number !== null && number >= max} aria-label="Fler">
        +
      </button>
    </div>
  )
}

export default NumberStepper
