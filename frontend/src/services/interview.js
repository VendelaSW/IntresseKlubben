import { apiPost } from './api'

// Intervjun när man skapar sin profil.
//
// analyzeInterests: en språkmodell i backend läser ut intressen ur fri text och matchar dem mot
// intressebiblioteket. Svaret är { token, proposals, followups }:
//  - proposals: förslag på intressen, [{ key, label, activity, interest: { id, name, path, is_new, parent_key } }].
//    Förslagen sparas inte, de ska godkännas av användaren först. En sub under ett nytt intresse har
//    parent_key (nyckeln på förslaget den ligger under).
//  - token: ett sigill som täcker exakt de här förslagen. Det är en ogenomskinlig sträng som frontend aldrig
//    läser eller ändrar, bara skickar tillbaka oförändrad när förslagen sparas. Det gäller i 30 minuter.
//  - followups: följdfrågor (av i första versionen, så tom).
// Kräver inloggning. Misslyckas anropet kastas ett ApiError: 503 om AI:n inte svarar (då visas ett svenskt
// meddelande och man kan välja ur listan i stället), 429 vid för många försök.
export function analyzeInterests(text) {
  return apiPost('/interests/analyze', { text })
}

// Skapar profilen och intressena i ett anrop när intervjun är klar. `batches` är [{ token, items: [{ key,
// activity? }] }]: ett sigill per analys, med nycklarna på de förslag användaren behöll. Förslag som inte
// skickas med räknas som bortvalda. Fel: 400 om ett sigill har gått ut (analysera om), 429 för många egna
// intressen i dag, 422 för sådant som inte får sparas.
export function completeInterview(data) {
  return apiPost('/profile/interview/complete', data)
}
