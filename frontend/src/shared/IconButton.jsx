import deleteIcon from '../assets/radera.png'
import editIcon from '../assets/redigera.png'

const ICONS = { edit: editIcon, delete: deleteIcon }

// Redigera och Radera som de handritade ikonerna (pennan och soptunnan) i stället för text. Texten finns kvar som
// aria-label och title, så att skärmläsare och den som håller musen över knappen får veta vad den gör.
function IconButton({ icon, label, className = '', ...props }) {
  return (
    <button type="button" className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>
      <img src={ICONS[icon]} alt="" />
    </button>
  )
}

export default IconButton
