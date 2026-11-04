import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import { ConfirmProvider } from './hooks/useConfirm.jsx'
import { queryClient } from './services/queryClient'
import './styles/index.css'
import './styles/matchPage.css'
import { applyChosenDesign } from './chosenDesign'
import { DEV_MODE } from './devtools/devMode'

// I testläget sätter testpanelen valen (se devtools/PadBackgroundPicker.jsx).
if (!DEV_MODE) applyChosenDesign()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
