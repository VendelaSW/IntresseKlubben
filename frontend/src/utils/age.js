// Åldersgränsen i appen (SCRUM-312): man ska ha fyllt 13 och vara högst 100 år. Samma värden som backend
// (app/core/age.py), som nekar en profil utanför gränsen. Används av födelsedatumet (BirthDatePicker) och åldersfiltret
// på Medlemmar.
export const MIN_AGE = 13
export const MAX_AGE = 100
