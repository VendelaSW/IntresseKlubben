// En tom lista, med texten nära knapparna under den. Erbjuder att skapa det som
// saknas (SCRUM-221): texten, t.ex. "Det finns inga klubbar för stickning. Vill
// du skapa en?" eller "Det finns inga events för Brädspel. Vill du skapa ett?", och en knapp med
// `createLabel` ("Skapa klubb", "Skapa event") som öppnar formuläret. Utan
// `onCreate` visas bara texten, t.ex. "Inga events matchar ditt filter.".
// `onClear` (valfri) ger "Rensa filter". Används på Klubbar och Events, så att
// de tomma listorna ser likadana ut.
function CreateOffer({ text, createLabel, onCreate, onClear }) {
  return (
    <div className="content-stack create-offer">
      <p className="hint-text">{text}</p>
      <div className="form-actions">
        {onCreate && (
          <button type="button" className="primary-button" onClick={onCreate}>
            {createLabel}
          </button>
        )}
        {onClear && (
          <button type="button" className="secondary-button" onClick={onClear}>
            Rensa filter
          </button>
        )}
      </div>
    </div>
  )
}

export default CreateOffer
