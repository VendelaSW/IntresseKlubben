import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

// Koden från en länk i ett mejl (?token=...), för sidorna som länkarna leder
// till (/verifiera, /aterstall, /bekrafta-losenord). Koden läses en gång och
// tas sedan bort ur adressfältet, så att den inte ligger kvar i historiken.
// Ger null om länken saknar kod.
export function useLinkToken() {
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // En ref: adressen töms nedan, och StrictMode kör effekterna två gånger i utvecklingsläget.
  const token = useRef(searchParams.get('token'))

  useEffect(() => {
    if (searchParams.has('token')) navigate(pathname, { replace: true })
  }, [searchParams, pathname, navigate])

  return token.current
}
