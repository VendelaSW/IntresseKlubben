import { useState } from 'react'
import brevIcon from '../assets/brev.png'
import eventIcon from '../assets/event.png'
import hemIcon from '../assets/hem.png'
import klubbarIcon from '../assets/klubbar.png'
import logo from '../assets/intresseklubben.png'
import personerIcon from '../assets/personer.png'
import BackButton from '../components/BackButton'
import Modal from '../components/Modal'
import ProfileAbout from '../components/ProfileAbout'
import TextareaWithCount from '../components/TextareaWithCount'

const NAV_ICONS = [
  { icon: hemIcon, label: 'Hem' },
  { icon: brevIcon, label: 'Brev' },
  { icon: personerIcon, label: 'Personer' },
  { icon: klubbarIcon, label: 'Klubbar' },
  { icon: eventIcon, label: 'Events' },
]

const COLORS = [
  { name: '--color-bg', hex: '#f7f1e3', label: 'Bakgrund' },
  { name: '--color-text', hex: '#1a1a1a', label: 'Text' },
  { name: '--color-accent', hex: '#f4c430', label: 'Accent' },
  { name: '--color-accent-soft', hex: '#fdf6e0', label: 'Blekgul (Om mig-ruta)' },
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
  const [exampleText, setExampleText] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

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
        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>Rund knapp (.round-button)</p>
        <div className="account-choice-links" style={{ marginTop: '1rem' }}>
          <button className="primary-button round-button" type="button" aria-label="Exempel" />
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
        <p className="swatch-label">Vanligt kort (.card)</p>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Klickbart kort (.card .card-interactive), t.ex. en tumnagel i personlistan
        </p>
        <p className="hint-text">
          Hovra med musen: kortet lyfts och får gul kant och skugga. Används bara på kort
          som går att klicka på, inte på kort som är behållare.
        </p>
        <div className="card card-interactive" style={{ marginTop: '1rem' }}>
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Profilkort (.card .card-wide), för att visa en hel profil, egen eller någon annans
        </p>
        <p className="hint-text">
          Inte klickbart, därför en blå hård skugga hela tiden. Klickbara kort har ingen skugga
          i vila och får gul kant, gul skugga och lyft vid hover.
        </p>
        <div className="card card-wide" style={{ marginTop: '1rem' }}>
          <div className="card-avatar" />
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <p className="card-text">Gillar brädspel, klättring och katter.</p>
        </div>
      </section>

      <section className="style-section">
        <h2>Sidlayout och listor</h2>
        <p className="hint-text">
          Byggstenarna som listsidor (Klubbar, Events) delar. Nya sidor ska återanvända dem och
          inte få egna kopior.
        </p>

        <p className="swatch-label" style={{ marginTop: '1.5rem' }}>
          Rubrikrad (.page-header) med rund knapp, och flikar (.filter-tabs)
        </p>
        <p className="hint-text">
          Lägg .app-section-centered på sidans .app-section för att centrera rubrik, flikar,
          kortrutnät och ark, med tätare avstånd (Klubbar och Events). Utan den ligger allt
          vänsterställt (Personer och Brev).
        </p>
        <section className="app-section app-section-centered" style={{ padding: 0, marginTop: '1rem' }}>
          <div className="page-header">
            <h1 className="app-title">Exempel</h1>
            <button className="primary-button round-button" type="button" aria-label="Skapa" />
          </div>
          <div className="filter-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="true" className="tag tag-selected">Första (2)</button>
            <button type="button" role="tab" aria-selected="false" className="tag">Andra (0)</button>
          </div>
        </section>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Filter (.filter-select-row, .filter-select-row-compact för smalare)
        </p>
        <div className="filter-select-row filter-select-row-compact" style={{ marginTop: '1rem' }}>
          <select aria-label="Exempel 1"><option>Alla intressen</option></select>
          <select aria-label="Exempel 2"><option>Alla kommuner</option></select>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Listkort (.list-card) i ett rutnät (.card-grid .card-grid-compact)
        </p>
        <p className="hint-text">
          Hela övre delen (.list-card-link) är klickbar. Knappar och märken ligger utanför den, i
          .card-actions. Beskrivningen kortas av efter tre rader (.list-card-description).
        </p>
        <div className="card-grid card-grid-compact" style={{ marginTop: '1rem' }}>
          <article className="card card-interactive list-card">
            <button type="button" className="list-card-link">
              <span className="card-title">Exempel</span>
              <span className="card-subheading">Göteborg · 3 medlemmar</span>
              <span className="card-text list-card-description">
                En kort beskrivning som visas på kortet. Är den lång kortas den av efter tre rader.
              </span>
            </button>
            <div className="card-actions">
              <span className="status-pill status-pill-success">Medlem</span>
              <span className="status-pill">Privat</span>
            </div>
          </article>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Statusmärken (.status-pill, med .status-pill-success, .status-pill-error eller .status-pill-owner)
        </p>
        <div className="card-actions" style={{ marginTop: '1rem' }}>
          <span className="status-pill">Vanlig</span>
          <span className="status-pill status-pill-success">Success</span>
          <span className="status-pill status-pill-error">Error</span>
          <span className="status-pill status-pill-owner">Ägare</span>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Ark (.card .sheet) för en posts egen vy (.detail-view) eller ett formulär (.auth-form .form-wide)
        </p>
        <p className="swatch-label" style={{ marginTop: '1rem' }}>
          "← Tillbaka" (BackButton) ligger ovanför rutan, inte inuti den
        </p>
        <div style={{ marginTop: '0.5rem' }}>
          <BackButton onClick={() => {}} />
        </div>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <section className="detail-view">
            <p className="card-title">Exempel</p>
            <p className="card-subheading">Göteborg · 3 medlemmar</p>
            <p className="card-text">Hela beskrivningen visas här.</p>
            <div className="card-actions">
              <button type="button" className="primary-button">Gå med</button>
            </div>
            <div className="detail-view-section">
              <p className="card-subheading">Ett avsnitt (.detail-view-section)</p>
              <p className="hint-text">Med en rad luft ovanför, för att skilja det från texten ovanför.</p>
            </div>
          </section>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Titelrad (.title-row): titel till vänster och ett märke i högerkanten
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <section className="detail-view">
            <div className="title-row">
              <p className="card-title">Exempel</p>
              <span className="status-pill">Öppet</span>
            </div>
            <p className="card-subheading">lör 10 okt. 13:30 · Slottsskogen</p>
          </section>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Personlista (.person-list, .person-list-item, .person-list-avatar)
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <div className="person-list">
            <p className="card-subheading">Medlemmar</p>
            <ul>
              <li>
                <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                  <span className="person-list-avatar card-avatar-initials" aria-hidden="true">E</span>
                  <span>Emmy</span>
                  <span className="hint-text">Ägare</span>
                </a>
              </li>
              <li>
                <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                  <span className="person-list-avatar card-avatar-initials" aria-hidden="true">L</span>
                  <span>Leonard</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="swatch-label" style={{ marginTop: '2rem' }}>
          Kompakt personlista (.person-list .person-list-compact)
        </p>
        <p className="hint-text">
          Liten text och små avatarer, för när många personer ska rymmas, t.ex. vilka som har
          svarat på ett event. Rubrikerna ovanför grupperna är .hint-text.
        </p>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <div className="person-list person-list-compact">
            <div>
              <p className="hint-text">Ja (2)</p>
              <ul>
                <li>
                  <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                    <span className="person-list-avatar card-avatar-initials" aria-hidden="true">E</span>
                    <span>Emmy</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                    <span className="person-list-avatar card-avatar-initials" aria-hidden="true">F</span>
                    <span>Filip</span>
                    <span className="status-pill">Blockerad</span>
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="hint-text">Kanske (1)</p>
              <ul>
                <li>
                  <a href="#" className="person-list-item" onClick={(e) => e.preventDefault()}>
                    <span className="person-list-avatar card-avatar-initials" aria-hidden="true">L</span>
                    <span>Leonard</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="style-section">
        <h2>Popup</h2>
        <p className="hint-text">
          Modal.jsx, byggd på det inbyggda &lt;dialog&gt;: en vit ruta (.card .modal) med rubrik och
          "Stäng" över en mörk bakgrund. Esc och ett klick på bakgrunden stänger den. En lång lista
          läggs i .modal-scroll så att den rullar, och en rad med kryssruta är en
          label.person-list-item. Används t.ex. för "Bjud in" på ett event.
        </p>
        <button type="button" className="secondary-button button-small" style={{ marginTop: '1rem' }} onClick={() => setModalOpen(true)}>
          Öppna exempel
        </button>
        {modalOpen && (
          <Modal title="Exempel" onClose={() => setModalOpen(false)}>
            <div className="modal-scroll">
              <div className="person-list person-list-compact">
                <ul>
                  <li>
                    <label className="person-list-item">
                      <input type="checkbox" />
                      <span className="person-list-avatar card-avatar-initials" aria-hidden="true">E</span>
                      <span>Emmy</span>
                    </label>
                  </li>
                  <li>
                    <label className="person-list-item">
                      <input type="checkbox" defaultChecked />
                      <span className="person-list-avatar card-avatar-initials" aria-hidden="true">L</span>
                      <span>Leonard</span>
                    </label>
                  </li>
                </ul>
              </div>
            </div>
            <div className="card-actions">
              <button type="button" className="secondary-button button-small" onClick={() => setModalOpen(false)}>
                Avbryt
              </button>
              <button type="button" className="primary-button button-small" onClick={() => setModalOpen(false)}>
                Klar
              </button>
            </div>
          </Modal>
        )}
      </section>

      <section className="style-section">
        <h2>Blek ruta (Om mig)</h2>
        <p className="hint-text">
          Ett eget fält (.soft-box): blekgult (--color-accent-soft) utan kant, samma rundning
          som formulärfälten. Smal som standard, så den passar inne i ett profilkort. Som "Om
          mig" bevarar den radbrytningar (.soft-box-text) och visas bara om texten finns.
          Med .soft-box-wide fyller den hela bredden i ett ark, t.ex. "Kommer du?" på ett event.
        </p>
        <div className="card card-wide content-stack" style={{ marginTop: '1rem' }}>
          <p className="card-title">Emmy, 24</p>
          <p className="card-subheading">Stockholm</p>
          <ProfileAbout text={'Hej! Jag gillar brädspel och klättring.\nSöker folk att spela med på söndagar.'} />
        </div>
        <div className="card sheet" style={{ marginTop: '1rem' }}>
          <section className="soft-box soft-box-wide">
            <h2>Kommer du?</h2>
            <ul className="tags">
              <li><button type="button" className="tag tag-selected">Ja</button></li>
              <li><button type="button" className="tag">Kanske</button></li>
              <li><button type="button" className="tag">Nej</button></li>
            </ul>
          </section>
        </div>
      </section>

      <section className="style-section">
        <h2>Formulärfält</h2>
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="style-guide-example">Exempel-fält</label>
          <input id="style-guide-example" type="text" placeholder="Skriv något..." />
          <p className="hint-text">Hjälptext under ett fält, t.ex. "Minst 8 tecken".</p>
          <label htmlFor="style-guide-textarea">Flerradigt fält (textarea)</label>
          <TextareaWithCount
            id="style-guide-textarea"
            value={exampleText}
            onChange={(e) => setExampleText(e.target.value)}
            maxLength={800}
            placeholder="Berätta lite om dig själv..."
          />
          <p className="hint-text">Teckenräknaren ligger inne i fältet, nere till höger.</p>
          <button type="submit">Skicka</button>
        </form>
        <p className="status-success" style={{ marginTop: '1rem' }}>Sparat!</p>
        <p className="status-error">Något gick fel, försök igen.</p>
      </section>
    </div>
  )
}

export default StyleGuide
