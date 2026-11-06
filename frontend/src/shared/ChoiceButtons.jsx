import InfoTip from './InfoTip'

// Ett val bland några få alternativ som en toggle: knapparna sitter ihop i en ruta,
// och den valda är gul (t.ex. vem som får gå med i en klubb). Egentligen
// radioknappar, så att tangentbord och skärmläsare fungerar som vanligt.
// `options` är [{ value, label, info, icon, tone }]. Valens `info` samlas i en enda
// i-ikon efter frågan, ett val i taget, i stället för en hjälptext. `icon` (valfri)
// står före texten, och `tone` (valfri: 'green', 'peach' eller 'lilac') är färgen
// när valet är valt, i stället för gult (t.ex. som Öppen och Privat på klubbkorten).
// `disabled` (valfri) stänger av ett val, med `disabledReason` som förklaring när
// man håller muspekaren över det.
function ChoiceButtons({ name, legend, options, value, onChange }) {
  const info = options.filter((o) => o.info).map((o) => ({ label: o.label, text: o.info }))

  return (
    <fieldset className="form-choice">
      <legend>
        <span className="form-field-label">
          {legend}
          {info.length > 0 && <InfoTip items={info} />}
        </span>
      </legend>
      <div className="choice-toggle">
        {options.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? 'is-selected' : undefined}
            data-tone={option.tone}
            title={option.disabled ? option.disabledReason : undefined}
          >
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.icon}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default ChoiceButtons
