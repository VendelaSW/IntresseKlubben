// Utkast av "Skapa din profil", så att det man fyllt i finns kvar om man råkar
// lämna sidan eller laddar om den innan profilen är sparad. Ett utkast per
// konto. sessionStorage, inte localStorage: utkastet försvinner när fliken
// stängs, så att uppgifter som födelsedatum inte blir liggande kvar på en
// delad dator. try/catch som i auth.js: lagringen kan vara blockerad, och då
// fungerar formuläret som vanligt, bara utan utkast.
const draftKey = (userId) => `intresseklubben.profileDraft.${userId}`

export function loadProfileDraft(userId) {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(userId)))
  } catch {
    return null
  }
}

export function saveProfileDraft(userId, draft) {
  try {
    sessionStorage.setItem(draftKey(userId), JSON.stringify(draft))
  } catch {
    // Går inte att spara: då finns inget utkast att komma tillbaka till.
  }
}

export function clearProfileDraft(userId) {
  try {
    sessionStorage.removeItem(draftKey(userId))
  } catch {
    // Inget att rensa.
  }
}
