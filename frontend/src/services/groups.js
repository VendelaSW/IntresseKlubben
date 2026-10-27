import { apiDelete, apiGet, apiPost, apiPut } from './api'
import { EVENTS_KEY } from './events'
import { HOUR, SECOND, cachedInBrowser, invalidate, queryClient } from './queryClient'

// Värdena måste matcha GroupVisibility i backend/app/models/group.py. `application`:
// man ansöker och ägaren godkänner (SCRUM-159).
export const VISIBILITY = { public: 'public', application: 'application', private: 'private' }

// Klubbens räckvidd (SCRUM-282), från minst till störst. value måste matcha
// GroupScope i backend/app/models/group.py.
export const SCOPES = [
  { value: 'kommun', label: 'Kommun' },
  { value: 'lan', label: 'Län' },
  { value: 'landskap', label: 'Landskap' },
  { value: 'landsdel', label: 'Landsdel' },
  { value: 'country', label: 'Hela Sverige' },
]

// Vilken nivå klubben passar för (SCRUM-216). value måste matcha SkillLevel i backend.
export const SKILL_LEVELS = [
  { value: 'beginner', label: 'Nybörjare' },
  { value: 'intermediate', label: 'Medel' },
  { value: 'experienced', label: 'Erfaren' },
  { value: 'all_levels', label: 'Alla nivåer' },
]

export const skillLevelLabel = (value) => SKILL_LEVELS.find((l) => l.value === value)?.label ?? null

// Områdena en klubb kan gälla: { landsdelar, landskap, lan, kommuner } (se
// GET /groups/regions). Ändras nästan aldrig, så de sparas i webbläsaren.
export function getRegions() {
  return cachedInBrowser(['regions'], () => apiGet('/groups/regions'), 24 * HOUR)
}

// Gäller klubben kommunen? Ja om den finns i kommunen eller gäller ett större
// område som kommunen ligger i (samma som filtret i GET /groups/). `regions` från
// getRegions; utan dem räknas bara klubbar i själva kommunen.
export function appliesToKommun(group, kommunCode, regions) {
  if (group.scope === 'kommun' || !group.scope) return group.municipality_code === kommunCode
  if (group.scope === 'country') return true
  const place = regions?.kommuner?.[kommunCode]
  if (!place) return false
  if (group.scope === 'lan') return group.scope_code === place.lan
  if (group.scope === 'landskap') return group.scope_code === place.landskap
  const landsdel = regions.landskap.find((l) => l.kod === place.landskap)?.landsdel
  return group.scope === 'landsdel' && group.scope_code === landsdel
}

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

export const MY_GROUPS_KEY = ['groups', 'mine']

// Grupper man är med i, även privata. Sparas i minnet en kort stund (se
// queryClient.js), så Klubbar, Events och kartan delar samma hämtning.
export const myGroupsQuery = {
  queryKey: MY_GROUPS_KEY,
  queryFn: () => apiGet('/groups/mine'),
  staleTime: 15 * SECOND,
}

export function getMyGroups() {
  return queryClient.fetchQuery(myGroupsQuery)
}

// Klubbarna en person är med i, som man själv får se (öppna, och privata man
// själv är med i), för personens profil. Ligger under ['groups'], så den hämtas
// om när man går med i eller lämnar en klubb (se changingMyGroups).
export function memberGroupsQuery(userId) {
  return {
    queryKey: ['groups', 'member', String(userId)],
    queryFn: () => apiGet(`/groups/member/${userId}`),
    staleTime: 15 * SECOND,
  }
}

// Klubbsidans tre listor (mina, förslag och inbjudningar) i ett anrop. Sparas
// i minnet som mina klubbar.
export const groupsOverviewQuery = {
  queryKey: ['groups', 'overview'],
  queryFn: () => apiGet('/groups/overview'),
  staleTime: 15 * SECOND,
}

// Kör ett anrop som ändrar vilka klubbar man är med i, och säger sedan till
// minnet (alla klubblistor). Klubbens events syns bara för medlemmar, så events
// hämtas också om.
async function changingMyGroups(request) {
  const result = await request
  invalidate(['groups'], EVENTS_KEY)
  return result
}

// Vilka som är med i gruppen, längst med först.
export function getGroupMembers(id) {
  return apiGet(`/groups/${id}/members`)
}

export function getGroupMessages(id) {
  return apiGet(`/groups/${id}/messages`)
}

export function sendGroupMessage(id, content) {
  return apiPost(`/groups/${id}/messages`, { content })
}

// Klubbens inlägg (nyheter, regler): det fastnålade först, sedan nyaste först.
// Bara för medlemmar.
export function getGroupPosts(id) {
  return apiGet(`/groups/${id}/posts`)
}

export function createGroupPost(id, content) {
  return apiPost(`/groups/${id}/posts`, { content })
}

// Bara den som skrev inlägget och klubbens ägare får radera det. Ett
// fastnålat inlägg får bara ägaren radera.
export function deleteGroupPost(id, postId) {
  return apiDelete(`/groups/${id}/posts/${postId}`)
}

// Bara ägaren. Ett inlägg i taget är fastnålat, så ett annat fastnålat tas loss.
export function pinGroupPost(id, postId) {
  return apiPut(`/groups/${id}/posts/${postId}/pin`)
}

export function unpinGroupPost(id, postId) {
  return apiDelete(`/groups/${id}/posts/${postId}/pin`)
}

export function createGroup(data) {
  return changingMyGroups(apiPost('/groups/', data))
}

// Returnerar gruppen med uppdaterat antal medlemmar.
export function joinGroup(id) {
  return changingMyGroups(apiPut(`/groups/${id}/members/me`))
}

export function leaveGroup(id) {
  return changingMyGroups(apiDelete(`/groups/${id}/members/me`))
}

export function deleteGroup(id) {
  return changingMyGroups(apiDelete(`/groups/${id}`))
}

// Bjuder in kompisar (userIds). Svaret är de som blev inbjudna den här gången.
export function inviteToGroup(id, userIds) {
  return apiPost(`/groups/${id}/invitations`, { user_ids: userIds })
}

// ---------- Ansökningar (SCRUM-159) ----------

// Ansöker till en klubb, med ett valfritt meddelande till ägaren. Svaret är klubben.
export function applyToGroup(id, message) {
  return changingMyGroups(apiPut(`/groups/${id}/requests/me`, { message }))
}

// Tar tillbaka sin ansökan. Svaret är klubben.
export function withdrawApplication(id) {
  return changingMyGroups(apiDelete(`/groups/${id}/requests/me`))
}

// Ansökningarna som väntar, för ägaren: [{ user, message, created_at }].
export function getJoinRequests(id) {
  return apiGet(`/groups/${id}/requests`)
}

// Ägaren godkänner (personen blir medlem) eller nekar en ansökan.
export function approveJoinRequest(id, userId) {
  return changingMyGroups(apiPut(`/groups/${id}/requests/${userId}`))
}

// `message` (valfritt): varför, till den som ansökt (följer med i notisen).
export function declineJoinRequest(id, userId, message) {
  return changingMyGroups(apiDelete(`/groups/${id}/requests/${userId}`, { message: message || null }))
}

// ---------- Roller (SCRUM-160) ----------

// Ägaren gör en medlem till administratör ('admin') eller vanlig medlem ('member') igen.
export function setGroupMemberRole(id, userId, role) {
  return apiPut(`/groups/${id}/members/${userId}/role`, { role })
}

// Ägaren eller en administratör tar bort en medlem ur klubben.
export function removeGroupMember(id, userId) {
  return changingMyGroups(apiDelete(`/groups/${id}/members/${userId}`))
}

// Den som skrev meddelandet, ägaren och administratörer får ta bort det ur klubbchatten.
export function deleteGroupMessage(id, messageId) {
  return apiDelete(`/groups/${id}/messages/${messageId}`)
}

// Avböjer en inbjudan.
export async function declineGroupInvitation(id) {
  const result = await apiDelete(`/groups/${id}/invitations/me`)
  invalidate(['groups'])
  return result
}

// Märket i headern räknas om när man har gått med i eller avböjt en klubb.
export const INVITATIONS_CHANGED = 'group-invitations-changed'

export function notifyInvitationsChanged() {
  window.dispatchEvent(new Event(INVITATIONS_CHANGED))
}
