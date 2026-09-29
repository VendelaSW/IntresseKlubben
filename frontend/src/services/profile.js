import { ApiError, apiGet, apiPatch } from './api'

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
