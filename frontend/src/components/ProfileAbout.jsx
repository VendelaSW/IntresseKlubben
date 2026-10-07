// "Om mig"-rutan i ett profilkort. Renderar ingenting om texten saknas.
function ProfileAbout({ text }) {
  if (!text) return null

  return (
    <section className="soft-box">
      <h2>Om mig</h2>
      <p className="soft-box-text">{text}</p>
    </section>
  )
}

export default ProfileAbout
