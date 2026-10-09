import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'
import { initScheme } from './stores/scheme'
import { restoreLocalTheme } from './stores/appearance'

initScheme()
restoreLocalTheme()
// Claim the preloaded Satoshi now: the first screen can sit text-free for a few
// seconds (orb only), and an unused preload is fetched for nothing and warned about.
void document.fonts?.load('500 16px Satoshi').catch(() => {})
// Deployed builds pick up newer deploys on their own (dev has HMR).
if (import.meta.env.PROD) void import('./freshness').then((m) => m.startFreshness())

// Dev only: drive Wendy from the console, e.g. __actora.ui('colors.set', { seed: '#7a5ad6' })
// or __actora.chat('find the best ramen nearby').
if (import.meta.env.DEV) {
  void Promise.all([import('./aelora/router'), import('./options/run'), import('./stores/agent')]).then(
    ([router, run, a]) => {
      ;(window as unknown as { __actora: object }).__actora = {
        ui: router.runUiAction,
        chat: run.say,
        // Feed a server event in, e.g. __actora.event('pending_action', {type: 'pending_action:created', id, kind, summary})
        event: (event: string, data: object) =>
          router.routeFrame(
            { type: 'event', event, data } as never,
            { send: () => true, subscribe: () => () => {} } as never,
          ),
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
