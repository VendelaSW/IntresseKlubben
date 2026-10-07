// Ett fält i ett formulär: etiketten ovanför och fältet under, tätt ihop. Lägg
// flera i en <div className="form-row"> för att ha dem bredvid varandra.
// `id` är fältets id (etiketten pekar på det), `children` är själva fältet.
function FormField({ id, label, children }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

export default FormField
