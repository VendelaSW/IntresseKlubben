import brevIcon from '../assets/brev.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import ProfileAbout from '../components/ProfileAbout'

const NAV_ICONS = [
  { icon: hemIcon, label: 'Hem' },
  { icon: brevIcon, label: 'Brev' },
  { icon: personerIcon, label: 'Personer' },
  { icon: klubbarIcon, label: 'Klubbar' },
]

const COLORS = [
  { name: '--color-bg', hex: '#f7f1e3', label: 'Bakgrund' },
  { name: '--color-text', hex: '#1a1a1a', label: 'Text' },
  { name: '--color-accent', hex: '#f4c430', label: 'Accent' },
  { name: '--color-line', hex: '#bfd7ed', label: 'Kantlinje' },
  { name: '--color-white', hex: '#ffffff', label: 'Vit (kort/boxar)' },
  { name: '--color-muted', hex: '#6b6b6b', label: 'Dämpad (platshållartext)' },
  { name: '--color-success', hex: '#3b6d11', label: 'Success (bekräftelser)' },
  { name: '--color-error', hex: '#a32d2d', label: 'Error (felmeddelanden)' },
]

const SIZES = [
  { name: '--text-hero', rem: '5rem', label: 'Hero', font: 'heading', weight: 700 },
  { name: '--text-h1', rem: '4rem', label: 'H1 / Sidrubrik', font: 'heading', weight: 700 },
  { name: '--text-card-title', rem: '2.25rem', label: 'Kort-titel (t.ex. namn i en box)', font: 'heading', weight: 700 },
  { name: '--text-h2', rem: '1.25rem', label: 'H2 / Överrubriker', font: 'body', weight: 700 },
  { name: '--text-subheading', rem: '1.05rem', label: 'Underrubrik', font: 'body', weight: 700 },
  { name: '--text-body', rem: '1rem', label: 'Brödtext', font: 'body', weight: 400 },
  { name: '--text-small', rem: '0.85rem', label: 'Finstilt', font: 'body', weight: 400 },
]

function StyleGuide() {
  return (
    <div className="page">
      <img src={logo} alt="Intresseklubben" className="logo" />
      <h1>Stilguide</h1>
      <p className="problem-statement">
        Färger, typsnitt och komponenter som redan används i Intresseklubben.
        Ändra i <code>styles/index.css</code>, den här sidan speglar bara det.
      </p>

      <section className="style-section">
        <h2>Färger</h2>
        <div className="swatch-grid">
          {COLORS.map((color) => (
            <div className="swatch" key={color.name}>
              <div className="swatch-color" style={{ background: `var(${color.name})` }} />
              <p className="swatch-label">{color.label}</p>
              <p className="swatch-code">{color.name}</p>
              <p className="swatch-code">{color.hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="style-section">
        <h2>Typografi</h2>
        <p className="tagline" style={{ fontSize: '2.5rem', marginTop: '1.5rem' }}>Caveat</p>
        <p className="problem-statement">
          Stora, personliga rubriker: Hero, sidrubrik (H1) och namn i boxar.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: '2.5rem',
            margin: '1.5rem 0 0',
          }}
        >
          Inter
        </p>
        <p className="problem-statement">
          Allt annat: brödtext, knappar, länkar, sektionsrubriker och underrubriker.
        </p>
        <a href="#" className="info-link" style={{ marginTop: '1rem' }} onClick={(e) => e.preventDefault()}>
          Länk-stil (info-link)
        </a>
        <p className="swatch-code">Inter Bold, gul understrykning, tonas ner vid hover</p>
      </section>

      <section className="style-section">
        <h2>Storlekar</h2>
        {SIZES.map((size) => (
          <div key={size.name} style={{ marginBottom: '1.5rem' }}>
            <p
              style={{
                fontFamily: size.font === 'heading' ? 'var(--font-heading)' : 'var(--font-body)',
                fontWeight: size.weight,
                fontSize: `var(${size.name})`,
                margin: 0,
              }}
            >
              {size.label}
            </p>
            <p className="swatch-code">{size.name} · {size.rem}</p>
          </div>
        ))}
      </section>

      <section className="style-section">
        <h2>Knappar</h2>
        <p className="swatch-label">Typsnitt: Inter (versaler, bokstavsavstånd)</p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <a href="#" className="account-choice-link" onClick={(e) => e.preventDefault()}>
            Sekundär knapp
          </a>
          <button className="primary-button" type="button">
            Primär knapp
          </button>
        </div>
        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>Liten variant (.button-small)</p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <a href="#" className="account-choice-link button-small" onClick={(e) => e.preventDefault()}>
            Sekundär
          </a>
          <button className="primary-button button-small" type="button">
            Primär
          </button>
        </div>
      </section>

      <section className="style-section">
        <h2>Taggar</h2>
        <p className="hint-text">
          Kontur = ej vald, klicka för att välja. Fylld gul = vald, klicka igen för att ta bort.
          Hovra med musen för att se de två extra hover-lägena, de syns inte i en stillbild.
        </p>
        <ul className="tags" style={{ marginTop: '1rem' }}>
          <li><button type="button" className="tag">Ej vald</button></li>
          <li><button type="button" className="tag tag-selected">Vald</button></li>
        </ul>
      </section>

      <section className="style-section">
        <h2>Ikoner</h2>
        <p className="swatch-label">
          Handritade, matchar loggans stil (.nav-icon). Ikon ovanför text, används i huvudmenyn.
        </p>
        <div className="swatch-grid" style={{ marginTop: '1rem' }}>
          {NAV_ICONS.map(({ icon, label }) => (
            <div className="swatch" key={label}>
              <span className="app-nav-link" style={{ padding: 0 }}>
                <img src={icon} alt="" className="nav-icon" />
                <span className="app-nav-label">{label}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="style-section">
        <h2>Boxar</h2>
        <div className="card">
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>
      </section>

      <section className="style-section">
        <h2>Om mig-ruta</h2>
        <p className="hint-text">
          Ett eget fält inne i ett profilkort (.profile-about): samma kant och rundning som
          formulärfälten, på kräm-bakgrund, med radbrytningar bevarade. Visas bara om texten finns.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <ProfileAbout text={'Hej! Jag gillar brädspel och klättring.\nSöker folk att spela med på söndagar.'} />
        </div>
      </section>

      <section className="style-section">
        <h2>Formulärfält</h2>
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="style-guide-example">Exempel-fält</label>
          <input id="style-guide-example" type="text" placeholder="Skriv något..." />
          <p className="hint-text">Hjälptext under ett fält, t.ex. "Minst 8 tecken".</p>
          <label htmlFor="style-guide-textarea">Flerradigt fält (textarea)</label>
          <textarea id="style-guide-textarea" rows={6} maxLength={800} placeholder="Berätta lite om dig själv..." />
          <p className="hint-text">Teckenräknare under fältet, t.ex. "0/800".</p>
          <button type="submit">Skicka</button>
        </form>
        <p className="status-success" style={{ marginTop: '1rem' }}>Sparat!</p>
        <p className="status-error">Något gick fel, försök igen.</p>
      </section>
    </div>
  )
}

export default StyleGuide
