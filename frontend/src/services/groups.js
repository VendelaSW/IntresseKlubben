import { apiDelete, apiGet, apiPost, apiPut } from './api'

// Värdena måste matcha GroupVisibility i backend/app/models/group.py.
export const VISIBILITY = { public: 'public', private: 'private' }

// Sorteringarna i GET /groups/, med texten för vanlig och omvänd ordning.
// value måste matcha GroupSort i backend/app/crud/group.py.
export const GROUP_SORTS = [
  { value: 'name', label: 'Namn', forwardLabel: 'A–Ö', reverseLabel: 'Ö–A' },
  { value: 'members', label: 'Medlemmar', forwardLabel: 'Flest först', reverseLabel: 'Färst först' },
  { value: 'newest', label: 'Skapad', forwardLabel: 'Nyast först', reverseLabel: 'Äldst först' },
]

const swedishOrder = new Intl.Collator('sv')

// Samma sökning och sortering som GET /groups/, för listorna som redan finns
// i webbläsaren (Mina klubbar och Förslag).
export function matchesSearch(group, q) {
  const text = q.trim().toLocaleLowerCase('sv')
  return (
    !text ||
    group.name.toLocaleLowerCase('sv').includes(text) ||
    group.description.toLocaleLowerCase('sv').includes(text)
  )
}

export function sortGroups(groups, sort, reverse) {
  const byName = (a, b) => swedishOrder.compare(a.name, b.name) || a.id - b.id
  const compare = {
    name: byName,
    members: (a, b) => b.member_count - a.member_count || byName(a, b),
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id,
  }[sort]
  return [...groups].sort((a, b) => (reverse ? -compare(a, b) : compare(a, b)))
}

// Öppna grupper, valfritt filtrerade på intresse och kommun, sökta (q, i namn
// och beskrivning), sorterade (reverse vänder ordningen) och en sida i taget
// (limit/offset). excludeMine tar bort grupper man redan är med i.
export function getGroups({ interestId, municipalityCode, q, sort, reverse, limit, offset, excludeMine } = {}) {
  const params = new URLSearchParams()
  if (interestId) params.set('interest_id', interestId)
  if (municipalityCode) params.set('municipality_code', municipalityCode)
  if (q?.trim()) params.set('q', q.trim())
  if (sort) params.set('sort', sort)
  if (reverse) params.set('reverse', 'true')
  if (limit != null) params.set('limit', limit)
  if (offset) params.set('offset', offset)
  if (excludeMine) params.set('exclude_mine', 'true')
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

// Klubbar man är inbjuden till (och inte redan med i), nyaste inbjudan först.
export function getGroupInvitations() {
  return apiGet('/groups/invitations')
}

// Bara antalet, för märket i headern.
export async function getGroupInvitationCount() {
  const data = await apiGet('/groups/invitations/count')
  return data.count
}

// Bjuder in kontakter (userIds). Svaret är de som blev inbjudna den här gången.
export function inviteToGroup(id, userIds) {
  return apiPost(`/groups/${id}/invitations`, { user_ids: userIds })
}

// Avböjer en inbjudan.
export function declineGroupInvitation(id) {
  return apiDelete(`/groups/${id}/invitations/me`)
}

// Märket i headern räknas om när man har gått med i eller avböjt en klubb.
export const INVITATIONS_CHANGED = 'group-invitations-changed'

export function notifyInvitationsChanged() {
  window.dispatchEvent(new Event(INVITATIONS_CHANGED))
}
