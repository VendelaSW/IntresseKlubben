// Flerradigt fält med teckenräknare inuti, nere till höger. Används i
// .auth-form-formulär (t.ex. "Om mig").
function TextareaWithCount({ id, value, onChange, maxLength, rows = 6, placeholder, required }) {
  return (
    <div className="textarea-count">
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        required={required}
      />
      <span className="hint-text textarea-count-number" aria-hidden="true">
        {value.length}/{maxLength}
      </span>
    </div>
  )
}

export default TextareaWithCount
