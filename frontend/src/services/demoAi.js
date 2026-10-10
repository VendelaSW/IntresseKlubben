import { apiPost } from './api'

// Demon: en språkmodell i backend läser ut intressen ur fri text och svarar med korta taggar på
// svenska, som ["klättring", "bakning"]. Taggarna är modellens egna ord och inte ur
// intressebiblioteket. Endpointen finns bara om backend körs med DEMO_AI=1. Misslyckas anropet
// (ingen backend, ingen nyckel, för många försök) kastas ett fel.
export function extractInterests(text) {
  return apiPost('/demo/extract-interests', { text }).then((data) => data.interests)
}
