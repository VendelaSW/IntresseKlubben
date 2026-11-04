import { initials } from './Avatar'
import { PlaceStamp, PosterName } from './Poster'

// Överst på en profil (Min profil och andras profiler): bilden, namnet och en mening med det viktigaste ("34 år
// och bor i Majorna i Göteborg"). Uppgifter som saknas hoppas över, i stället för en rad med "–". `children`
// hamnar under meningen, t.ex. "Redigera profil". `heading` är rubriknivån för namnet ('h1' på andras profiler,
// där namnet är sidans rubrik). `maxLetters` är hur många initialer som står i cirkeln när bild saknas (2 på andras
// profiler, som på personkorten). Med `poster` (på en affisch, se components/Poster.jsx) står namnet i tryckbokstäver
// och det viktigaste i den svarta rutan.
// En dold ålder (SCRUM-134) syns bara för en själv och för moderatorer, och då med "(dold för andra)".
export function profileFacts(profile) {
  const { age, district, municipality_name: municipality } = profile
  const place = district && municipality ? `${district} i ${municipality}` : (municipality ?? district)
  const ageText = age != null ? `${age} år${profile.age_hidden ? ' (dold för andra)' : ''}` : null
  if (ageText && place) return `${ageText} och bor i ${place}`
  if (place) return `Bor i ${place}`
  return ageText ?? ''
}

function ProfileHeader({ name, imageUrl, facts, heading: Heading = 'h2', maxLetters = 1, poster = false, children }) {
  const initial = initials(name, maxLetters)
  return (
    <header className="profile-header">
      {imageUrl ? (
        <img src={imageUrl} alt={`Profilbild för ${name}`} className="profile-avatar profile-header-avatar" />
      ) : (
        <div className="profile-avatar profile-avatar-empty profile-header-avatar" aria-hidden="true">
          {initial}
        </div>
      )}
      <div className="profile-header-text">
        {poster ? (
          <PosterName as={Heading} className="profile-header-name poster-name-large">
            {name}
          </PosterName>
        ) : (
          <Heading className="profile-header-name">{name}</Heading>
        )}
        {facts && (poster ? <PlaceStamp>{facts}</PlaceStamp> : <p className="profile-header-facts">{facts}</p>)}
        {children}
      </div>
    </header>
  )
}

export default ProfileHeader
