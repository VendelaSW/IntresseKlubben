import { apiPost } from './api'

// Intervjun när man skapar sin profil: en språkmodell i backend läser ut intressen ur fri text och
// svarar med ett träd, [{ name, aliases, subtags: [{ name, aliases }] }], där name är intresset och
// subtags är något specifikt inom det. Taggarna är modellens egna ord och inte ur
// intressebiblioteket. Kräver inloggning. Misslyckas anropet (ingen nyckel i backend, för många
// försök) kastas ett fel.
export function extractInterests(text) {
  return apiPost('/profile/interview/interests', { text }).then((data) => data.interests)
}
