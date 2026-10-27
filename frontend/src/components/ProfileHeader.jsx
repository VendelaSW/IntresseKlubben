// Överst på en profil (Min profil och andras profiler): bilden, namnet och en mening med det viktigaste ("34 år
// och bor i Majorna i Göteborg"). Uppgifter som saknas hoppas över, i stället för en rad med "–". `children`
// hamnar under meningen, t.ex. "Redigera profil". `heading` är rubriknivån för namnet ('h1' på andras profiler,
// där namnet är sidans rubrik).
// En dold ålder (SCRUM-134) syns bara för en själv och för moderatorer, och då med "(dold för andra)".
export function profileFacts(profile) {
  const { age, district, municipality_name: municipality } = profile
  const place = district && municipality ? `${district} i ${municipality}` : (municipality ?? district)
  const ageText = age != null ? `${age} år${profile.age_hidden ? ' (dold för andra)' : ''}` : null
  if (ageText && place) return `${ageText} och bor i ${place}`
  if (place) return `Bor i ${place}`
  return ageText ?? ''
}

function ProfileHeader({ name, imageUrl, facts, heading: Heading = 'h2', children }) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?'
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
        <Heading className="profile-header-name">{name}</Heading>
        {facts && <p className="profile-header-facts">{facts}</p>}
        {children}
      </div>
    </header>
  )
}

export default ProfileHeader
