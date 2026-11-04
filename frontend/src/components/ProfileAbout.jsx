import { PosterAbout } from './Poster'

// "Om mig"-rutan i ett profilkort. Renderar ingenting om texten saknas. Med `poster` (på en affisch, se
// components/Poster.jsx) står texten med det gula strecket, som på matchningskortet.
function ProfileAbout({ text, poster = false }) {
  if (!text) return null
  if (poster) return <PosterAbout text={text} heading="Om mig" />

  return (
    <section className="soft-box">
      <h2>Om mig</h2>
      <p className="soft-box-text">{text}</p>
    </section>
  )
}

export default ProfileAbout
