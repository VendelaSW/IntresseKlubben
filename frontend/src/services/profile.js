import { ApiError, apiGet, apiPatch, apiPost, apiPut } from './api'
import { MY_INTERESTS_KEY } from './interests'
import { HOUR, MINUTE, cachedInBrowser, queryClient } from './queryClient'
import { resizeProfileImage } from './resizeProfileImage'

// Värdena måste matcha GenderEnum i backend/app/models/profile.py.
export const GENDER_OPTIONS = [
  { value: 'kvinna', label: 'Kvinna' },
  { value: 'man', label: 'Man' },
  { value: 'ickebinär', label: 'Icke-binär' },
  { value: 'annat', label: 'Annat' },
  { value: 'vill inte uppge', label: 'Vill inte uppge' },
]

export function genderLabel(value) {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? null
}

// Rubriken och platshållaren för "Om mig"-fältet. Den långa rubriken står i Redigera profil, där frågan inte syns. I intervjun
// står frågan redan ovanför rutan, så där räcker den korta (annars säger de nästan samma sak två gånger och steget får inte
// plats på en liten mobil).
export const ABOUT_LABEL = 'Beskriv dig själv och vilken sorts människor du vill träffa'
export const ABOUT_LABEL_SHORT = 'Om dig'
export const ABOUT_PLACEHOLDER =
  'T.ex. Jag är lugn och nyfiken, jobbar som lärare och är ny i stan. På fritiden klättrar jag och spelar brädspel. Jag vill träffa folk som också gillar klättring och spelkvällar, helst någon som är lika pratglad som jag och gärna tar initiativ.'

// Under "Om mig"-fältet, i intervjun och i Redigera profil: att texten läses av en AI-tjänst.
export const ABOUT_AI_NOTE =
  'Vi låter en AI-tjänst läsa din text. Den kollar att tonen är trevlig och hjälper oss att para ihop dig med medlemmar som delar dina intressen.'

export const PROFILE_KEY = ['profile']

// Returnerar null om användaren inte har skapat någon profil än. Profilen
// sparas i minnet (se queryClient.js) och uppdateras av allt nedan som ändrar
// den, så den hämtas bara en gång även när kartan, profilrutan och profilsidan
// alla behöver den.
export const profileQuery = {
  queryKey: PROFILE_KEY,
  queryFn: async () => {
    try {
      return await apiGet('/profile/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },
  staleTime: 5 * MINUTE,
}

export function getProfile() {
  return queryClient.fetchQuery(profileQuery)
}

// Sparar en profil som backend just svarat med, så att nästa getProfile inte
// behöver hämta den igen.
function remember(profile) {
  queryClient.setQueryData(PROFILE_KEY, profile)
  return profile
}

const swedishOrder = new Intl.Collator('sv')

// Alla 290 kommuner, sorterade i svensk ordning (å, ä, ö sist). Ändras i
// praktiken aldrig, så de sparas i webbläsaren (se queryClient.js).
export function getMunicipalities() {
  return cachedInBrowser(
    ['municipalities'],
    async () => {
      const list = await apiGet('/municipalities/')
      return list.sort((a, b) => swedishOrder.compare(a.name, b.name))
    },
    24 * HOUR,
  )
}

// Skapar profilen. Alla obligatoriska fält och minst ett intresse
// (interest_ids) måste vara med, intressena sparas i samma anrop.
export async function createProfile(data) {
  const profile = remember(await apiPost('/profile/', data))
  // Intressena sparades i samma anrop.
  queryClient.invalidateQueries({ queryKey: MY_INTERESTS_KEY })
  return profile
}

// Kontrollerar Om mig-texten utan att spara något, så att man får veta att den nekas redan när man har skrivit den.
// Samma kontroll som när profilen sparas. Går texten bra svarar det tomt; annars kastas ett ApiError med backendens
// svenska meddelande (422 om texten inte får finnas, 503 om kontrollen inte gick att köra, 429 vid för många försök).
export function checkProfileText(text) {
  return apiPost('/profile/text-check', { profile_text: text })
}

// Ändrar en befintlig profil, bara fälten som skickas med.
export async function updateProfile(data) {
  return remember(await apiPatch('/profile/', data))
}

// En annan användares profil, skrivskyddat. null om personen inte har
// skapat någon profil än (samma 404-hantering som getProfile). Också null för
// en adress som inte är ett id (422), t.ex. en gammal länk med användarnamn.
// Sparas i minnet en kort stund (se queryClient.js), så en profil man nyss
// tittat på visas direkt.
export function userProfileQuery(userId) {
  return {
    queryKey: ['user-profile', String(userId)],
    queryFn: async () => {
      try {
        return await apiGet(`/users/${userId}/profile`)
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 422)) return null
        throw err
      }
    },
    staleTime: 15 * 1000,
  }
}

export function getUserProfile(userId) {
  return queryClient.fetchQuery(userProfileQuery(userId))
}

// Profilbild: skala om (WebP, eller JPEG på iPhone), be backend om en
// uppladdningslänk, ladda upp direkt till bucketen och bekräfta. Returnerar
// den uppdaterade profilen.
export async function uploadProfileImage(file) {
  return uploadResizedImage(await resizeProfileImage(file))
}

// Samma sak för en bild som redan är omskalad (används när bilden väljs i
// "Skapa din profil" och laddas upp först när profilen har sparats). Länken
// gäller bara för bildens filtyp, så den skickas med.
export async function uploadResizedImage(image) {
  const { upload_url, key, upload_headers } = await apiPost('/profile/image/upload-url', { content_type: image.type })
  // Backend säger vilka headers som ingår i länkens signatur (filtyp och
  // cache-inställning, så att bilden kan sparas i webbläsaren). En äldre backend
  // skickar inga, och då räcker filtypen.
  const res = await fetch(upload_url, {
    method: 'PUT',
    headers: upload_headers ?? { 'Content-Type': image.type },
    body: image,
  })
  if (!res.ok) throw new Error('Uppladdningen misslyckades. Försök igen.')
  return remember(await apiPut('/profile/image', { key }))
}
