import { createContext, useContext } from 'react'

// Finns det en tidigare sida i appen att gå tillbaka till med navigate(-1)?
// Används av "Tillbaka" på sidor som kan öppnas direkt via en länk (då finns
// ingen tidigare sida, och navigate(-1) skulle ta en ut ur appen).
//
// I appen avgör webbläsarens historik: window.history.state.idx är satt av
// react-router och är 0 bara för sidans allra första post. På kartan har
// blocken en egen historik (se MapPagePad), och där talar CanGoBackContext om
// svaret i stället.
export const CanGoBackContext = createContext(null)

export function useCanGoBack() {
  const fromPad = useContext(CanGoBackContext)
  return () => (fromPad ? fromPad() : Boolean(window.history.state && window.history.state.idx > 0))
}
