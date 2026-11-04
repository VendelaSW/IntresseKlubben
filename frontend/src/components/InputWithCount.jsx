// Enradigt textfält med teckenräknare inuti, till höger, så att man ser gränsen
// medan man skriver (t.ex. en klubbs namn). Flerradigt: TextareaWithCount.
function InputWithCount({ id, value, onChange, maxLength, placeholder, required, className }) {
  return (
    <div className="input-count">
      <input
        id={id}
        type="text"
        className={className}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
      />
      <span className="hint-text input-count-number" aria-hidden="true">
        {value.length}/{maxLength}
      </span>
    </div>
  )
}

export default InputWithCount
