import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NoWebGPU } from './NoWebGPU'
import './styles.css'

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
