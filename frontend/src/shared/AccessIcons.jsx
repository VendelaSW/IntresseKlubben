// Ikonerna för hur man kommer med i en klubb eller på ett event (Öppet, Privat, Ansökan).
export function LockIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d={open ? 'M8 11V7a4 4 0 0 1 7.9-.9' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
    </svg>
  )
}

export function LetterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="m4 8 8 6 8-6" />
    </svg>
  )
}
