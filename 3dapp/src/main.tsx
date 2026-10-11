import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NoWebGPU } from './NoWebGPU'
import { restoreLocalTheme } from '@actora/stores/appearance'
import { initScheme } from '@actora/stores/scheme'
import './look/fonts'
import './styles.css'

// The saved colour scheme and theme choice, as the 2D app restores them.
initScheme()
restoreLocalTheme()

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
