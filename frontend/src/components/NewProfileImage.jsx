import { useEffect, useState } from 'react'
import { resizeProfileImage } from '../services/resizeProfileImage'

// Bildväljare när profilen inte finns än ("Skapa din profil" och intervjun). Bilden skalas
// om direkt men laddas upp först när profilen sparas.
export default function NewProfileImage({ name, image, onChange }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!image) return undefined
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  async function handleFile(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      onChange(await resizeProfileImage(file))
    } catch (err) {
      setError(err.message)
    }
  }

  const initial = name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <div className="profile-image">
      {image && preview ? (
        <img src={preview} alt="Förhandsvisning av din profilbild" className="profile-avatar" />
      ) : (
        <div className="profile-avatar profile-avatar-empty" aria-hidden="true">
          {initial}
        </div>
      )}
      <label className="secondary-button button-small">
        {image ? 'Byt bild' : 'Lägg till bild'}
        <input type="file" accept="image/*" className="visually-hidden" onChange={handleFile} />
      </label>
      {image && <p className="hint-text">Bilden laddas upp när du sparar profilen.</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
