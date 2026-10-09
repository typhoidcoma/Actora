import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'
import { initScheme } from './stores/scheme'
import { restoreLocalTheme } from './stores/appearance'

initScheme()
restoreLocalTheme()

// Dev only: drive Wendy from the console, e.g. __actora.ui('colors.set', { seed: '#7a5ad6' })
// or __actora.chat('find the best ramen nearby').
if (import.meta.env.DEV) {
  void Promise.all([import('./aelora/router'), import('./options/run'), import('./stores/agent')]).then(
    ([router, run, a]) => {
      ;(window as unknown as { __actora: object }).__actora = {
        ui: router.runUiAction,
        chat: run.say,
        agent: a.useAgent,
      }
    },
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
