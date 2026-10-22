// Testläget (se backend/app/devtools och CONTRIBUTING.md): "Logga in som ..." och testpanelen. Bara på när
// frontend startas med `npm run dev:test`. Vite byter ut värdet när appen byggs, så i en vanlig build (Vercel) är
// det alltid false och testlägets kod kommer inte ens med. Skulle det ändå slås på där finns inga /dev-adresser i
// backend, så knapparna gör inget.
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === '1'

// Adressen telefonen öppnar appen på, när testläget startades med `npm run dev:telefon` (annars tom).
export const PHONE_URL = import.meta.env.VITE_DEV_PHONE_URL || ''
