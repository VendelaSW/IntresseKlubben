import InfoTip from './InfoTip'

// Ett fält i ett formulär: etiketten ovanför och fältet under, tätt ihop. Lägg
// flera i en <div className="form-row"> för att ha dem bredvid varandra.
// `id` är fältets id (etiketten pekar på det), `children` är själva fältet.
// `required` sätter en * efter etiketten (fält utan * är valfria, se RequiredNote).
// Själva fältet behöver fortfarande sitt eget `required`, som skärmläsare läser upp.
// `info` är en förklaring i en i-ikon bredvid etiketten, i stället för en hjälptext.
// `className` läggs till fältets egen, t.ex. var det ligger i ett .form-grid.
function FormField({ id, label, required, info, className, children }) {
  return (
    <div className={className ? `form-field ${className}` : 'form-field'}>
      <div className="form-field-label">
        <label htmlFor={id}>
          {label}
          {required && (
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {info && <InfoTip text={info} />}
      </div>
      {children}
    </div>
  )
}

// Raden som förklarar stjärnan i formulär med FormField `required`, bredvid rubriken (.form-header).
export function RequiredNote() {
  return (
    <p className="hint-text required-note">
      <span className="required-mark" aria-hidden="true">
        *
      </span>{' '}
      måste fyllas i
    </p>
  )
}

export default FormField
