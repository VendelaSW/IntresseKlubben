// En del av ett formulär med fält som hör ihop (t.ex. "Medlemmar"): rubriken och en
// kort undertext till vänster, fälten till höger, och en streckad linje mot nästa del.
// På smala skärmar ligger rubriken ovanför fälten. Fälten kan ligga i ett rutnät
// (.form-grid) eller på en rad (.form-inline). `grow` låter delen ta den höjd som blir
// över i ett .form-fit-formulär, för ett fält som kan växa (beskrivningen, kartan).
// Ett tal i stället för true är delens andel av den höjden, jämfört med de andra
// (true är 1). En del utan högt fält får sitt innehåll centrerat i höjden.
// `aside` står under rubriken i vänsterspalten (t.ex. profilbilden), så att den
// använder platsen där utan att fälten flyttar sig.
function FormSection({ title, description, grow, aside, children }) {
  return (
    <section
      className={`form-section${grow ? ' form-section-grow' : ''}`}
      style={typeof grow === 'number' ? { flexGrow: grow } : undefined}
    >
      <div className="form-section-head">
        <h3>{title}</h3>
        {description && <p className="hint-text">{description}</p>}
        {aside}
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  )
}

export default FormSection
