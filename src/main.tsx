import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'
import { initScheme } from './stores/scheme'

initScheme()

// Dev only: drive ui_actions from the console, e.g. __actora.ui('colors.set', { seed: '#7a5ad6' }).
if (import.meta.env.DEV) {
  void import('./aelora/router').then(({ runUiAction }) => {
    ;(window as unknown as { __actora: object }).__actora = { ui: runUiAction }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
