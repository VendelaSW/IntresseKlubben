import plusIcon from '../assets/plus.png'

// "+ Skapa klubb" och "+ Skapa event" bredvid sidans rubrik: en gul knapp med
// det handritade plusset före texten, så att det syns vad knappen gör.
function CreateButton({ label, onClick }) {
  return (
    <button type="button" className="primary-button button-small create-button" onClick={onClick}>
      <img src={plusIcon} alt="" />
      {label}
    </button>
  )
}

export default CreateButton
