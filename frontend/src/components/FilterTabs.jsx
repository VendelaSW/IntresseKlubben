// Flikarna överst i ett block (Brev, Personer, Klubbar, Events, Moderering): en rad knappar ihop, den valda gul.
// `tabs` är [{ id, label, short, count }]: `short` är namnet på mobil, där alla flikar ska få plats på en rad
// ("Mina" i stället för "Mina klubbar"), och `count` antalet, som visas efter namnet. Noll visas inte, så att bara
// flikar med något i säger något ("Inbjudningar 2", inte "Förslag (0)"). `onChange(id)` byter flik. Hela namnet,
// med antalet, läses alltid upp av skärmläsare.
function FilterTabs({ tabs, active, onChange }) {
  return (
    <div className="filter-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          aria-label={t.count === undefined ? t.label : `${t.label} (${t.count})`}
          className={`tag${active === t.id ? ' tag-selected' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="filter-tab-label" aria-hidden="true">
            {t.label}
          </span>
          {t.short && (
            <span className="filter-tab-short" aria-hidden="true">
              {t.short}
            </span>
          )}
          {t.count !== undefined && Number.parseInt(t.count, 10) !== 0 && (
            <span className="filter-tab-count" aria-hidden="true">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export default FilterTabs
