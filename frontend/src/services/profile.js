import { ApiError, apiGet, apiPatch, apiPost, apiPut } from './api'
import { imageToWebp } from './imageToWebp'

// Värdena måste matcha GenderEnum i backend/app/models/profile.py.
export const GENDER_OPTIONS = [
  { value: 'kvinna', label: 'Kvinna' },
  { value: 'man', label: 'Man' },
  { value: 'ickebinär', label: 'Icke-binär' },
  { value: 'annat', label: 'Annat' },
]

export function genderLabel(value) {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? null
}

// Returnerar null om användaren inte har skapat någon profil än.
export async function getProfile() {
  try {
    return await apiGet('/profile/')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

const swedishOrder = new Intl.Collator('sv')

// Alla 290 kommuner, sorterade i svensk ordning (å, ä, ö sist).
export async function getMunicipalities() {
  const list = await apiGet('/municipalities/')
  return list.sort((a, b) => swedishOrder.compare(a.name, b.name))
}

export function updateProfile(data) {
  return apiPatch('/profile/', data)
}

// En annan användares profil, skrivskyddat. null om personen inte har
// skapat någon profil än (samma 404-hantering som getProfile).
export async function getUserProfile(username) {
  try {
    return await apiGet(`/users/${encodeURIComponent(username)}/profile`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

// Profilbild: gör om till WebP, be backend om en uppladdningslänk, ladda upp
// direkt till bucketen och bekräfta. Returnerar den uppdaterade profilen.
export async function uploadProfileImage(file) {
  return uploadProfileWebp(await imageToWebp(file))
}

// Samma sak för en bild som redan är gjord till WebP (används när bilden
// väljs i "Skapa din profil" och laddas upp först när profilen har sparats).
export async function uploadProfileWebp(webp) {
  const { upload_url, key } = await apiPost('/profile/image/upload-url', {})
  const res = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: webp,
  })
  if (!res.ok) throw new Error('Uppladdningen misslyckades. Försök igen.')
  return apiPut('/profile/image', { key })
}
