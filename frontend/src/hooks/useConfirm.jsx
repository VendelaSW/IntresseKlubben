import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from '../components/Modal'

// "Är du säker?" i appens egen ruta (Modal) i stället för webbläsarens confirm(), som ser ut som en annan app och
// inte visas överallt (och då svarar nej av sig själv). Används så här:
//
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Gå ur Löparna', text: 'Vill du gå ur klubben?', confirmLabel: 'Gå ur', danger: true })))
//     return
//
// Svaret är true om man trycker på knappen, annars false (Avbryt, Stäng, Esc eller ett klick bredvid). `danger`
// är för det som inte går att ångra: då är Avbryt den gula knappen och valet röd, som i "Radera eventet".
const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [question, setQuestion] = useState(null)
  const answer = useRef(null)

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        answer.current?.(false)
        answer.current = resolve
        setQuestion(options)
      }),
    [],
  )

  function close(result) {
    answer.current?.(result)
    answer.current = null
    setQuestion(null)
  }

  const { title, text, confirmLabel = 'Ja', cancelLabel = 'Avbryt', danger = false } = question ?? {}

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {question && (
        <Modal title={title} onClose={() => close(false)}>
          <div className="auth-form form-wide confirm-dialog">
            {text && <p className="card-text">{text}</p>}
            <div className="form-actions">
              {danger ? (
                <>
                  <button type="button" onClick={() => close(false)}>
                    {cancelLabel}
                  </button>
                  <button type="button" className="button-danger" onClick={() => close(true)}>
                    {confirmLabel}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => close(true)}>
                    {confirmLabel}
                  </button>
                  <button type="button" className="button-secondary" onClick={() => close(false)}>
                    {cancelLabel}
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}
