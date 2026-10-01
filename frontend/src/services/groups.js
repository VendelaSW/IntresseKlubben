import { apiDelete, apiGet, apiPost, apiPut } from './api'

// Värdena måste matcha GroupVisibility i backend/app/models/group.py.
export const VISIBILITY = { public: 'public', private: 'private' }

// Alla öppna grupper, valfritt filtrerade på intresse och kommun.
export function getGroups({ interestId, municipalityCode } = {}) {
  const params = new URLSearchParams()
  if (interestId) params.set('interest_id', interestId)
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  const query = params.toString()
  return apiGet(`/groups/${query ? `?${query}` : ''}`)
}

// Grupper man är med i, även privata.
export function getMyGroups() {
  return apiGet('/groups/mine')
}

// Öppna grupper för ens intressen som man inte redan är med i.
export function getSuggestedGroups() {
  return apiGet('/groups/suggested')
}

// Vilka som är med i gruppen, längst med först.
export function getGroupMembers(id) {
  return apiGet(`/groups/${id}/members`)
}

export function createGroup(data) {
  return apiPost('/groups/', data)
}

// Returnerar gruppen med uppdaterat antal medlemmar.
export function joinGroup(id) {
  return apiPut(`/groups/${id}/members/me`)
}

export function leaveGroup(id) {
  return apiDelete(`/groups/${id}/members/me`)
}

export function deleteGroup(id) {
  return apiDelete(`/groups/${id}`)
}
