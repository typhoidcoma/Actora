import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NoWebGPU } from './NoWebGPU'
import { onWebgpuFailed, webgpuReady } from './gpu'
import { loadWorld } from './look/loadWorld'
import { restoreLocalTheme } from '@actora/stores/appearance'
import { initScheme } from '@actora/stores/scheme'
import { installTapSounds } from '@actora/sound/sound'
import { sayPolicy } from '@actora/options/run'
import './look/fonts'
import './styles.css'

// The saved colour scheme and theme choice, as the 2D app restores them.
initScheme()
restoreLocalTheme()
// Quiet taps on the overlay's controls, as the 2D app (the scene's own panes are canvas, so they stay silent).
installTapSounds()
// A long question doesn't jump to the chat: she plays out her thinking first, and
// the chat opens once a long answer is in (look/longAnswers.ts).
sayPolicy.openChatForLargeQuestions = false

// Dev only: drive the agent and the stores from the console, as the 2D app's __actora,
// e.g. __actora.ui('chat.open'), __actora.chat('plan my day'), __actora.stores.ui.getState().
if (import.meta.env.DEV) {
  void Promise.all([
    import('@actora/aelora/router'),
    import('@actora/options/run'),
    import('@actora/stores/agent'),
    import('@actora/stores/entities'),
    import('@actora/stores/ui'),
    import('@actora/stores/scheme'),
  ]).then(([router, run, agent, entities, ui, scheme]) => {
    ;(window as unknown as { __actora: object }).__actora = {
      ui: router.runUiAction,
      chat: run.say,
      open: ui.ui,
      // e.g. __actora.colors({ accent: '#7c3aed' }); __actora.colors(null) for the brand.
      colors: (input: Parameters<typeof scheme.setColors>[0] | null) => (input ? scheme.setColors(input) : scheme.resetColors()),
      stores: { agent: agent.useAgent, entities: entities.useEntities, ui: ui.useUi },
    }
  })
}

const root = createRoot(document.getElementById('root')!)
onWebgpuFailed(() => root.render(<NoWebGPU />))
void webgpuReady().then((ok) => {
  // Start downloading the scene now, so it arrives while sign-in and the socket come up.
  if (ok) void loadWorld()
  root.render(<StrictMode>{ok ? <App /> : <NoWebGPU />}</StrictMode>)
})
