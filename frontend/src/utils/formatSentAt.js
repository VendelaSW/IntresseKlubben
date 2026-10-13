const clock = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })
const dayAndMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

// När ett brev skickades, i användarens egen tid: "14:32" i dag, "igår 14:32",
// "7 okt. 14:32" tidigare i år och "7 okt. 2025 14:32" tidigare år. Används både
// i chatten och på kuverten på Brev.
export function formatSentAt(value, now = new Date()) {
  const sent = new Date(value)
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const daysAgo = Math.round((startOfDay(now) - startOfDay(sent)) / 86400000)
  const time = clock.format(sent)
  // daysAgo kan bli negativt om datorns klocka går efter; visa då som i dag.
  if (daysAgo <= 0) return time
  if (daysAgo === 1) return `igår ${time}`
  const day = sent.getFullYear() === now.getFullYear() ? dayAndMonth.format(sent) : fullDate.format(sent)
  return `${day} ${time}`
}
