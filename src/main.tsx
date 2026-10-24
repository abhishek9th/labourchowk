import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { I18nProvider } from '@/i18n'
import { AuthProvider } from '@/auth/AuthProvider'
import { LocationProvider } from '@/components/Location'
import { ToastProvider } from '@/components/ui'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ToastProvider>
            <LocationProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </LocationProvider>
          </ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
