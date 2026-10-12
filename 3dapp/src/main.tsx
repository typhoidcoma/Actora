import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NoWebGPU } from './NoWebGPU'
import { restoreLocalTheme } from '@actora/stores/appearance'
import { initScheme } from '@actora/stores/scheme'
import { sayPolicy } from '@actora/options/run'
import './look/fonts'
import './styles.css'

// The saved colour scheme and theme choice, as the 2D app restores them.
initScheme()
restoreLocalTheme()
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
  ]).then(([router, run, agent, entities, ui]) => {
    ;(window as unknown as { __actora: object }).__actora = {
      ui: router.runUiAction,
      chat: run.say,
      open: ui.ui,
      stores: { agent: agent.useAgent, entities: entities.useEntities, ui: ui.useUi },
    }
  })
}

/** WebGPU only: no WebGL fallback, so ask for an adapter before mounting anything. */
async function webgpuReady(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

const root = createRoot(document.getElementById('root')!)
void webgpuReady().then((ok) => root.render(<StrictMode>{ok ? <App /> : <NoWebGPU />}</StrictMode>))
