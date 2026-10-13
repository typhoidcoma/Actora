/**
 * WebGPU on real hardware, or nothing. No WebGL2 backend, no software
 * (fallback) adapter: if either is all that's on offer, the app says so
 * (NoWebGPU) instead of running slowly.
 */

/** Ask for the fast GPU on machines with two (laptops with a discrete card). */
export const POWER_PREFERENCE = 'high-performance' as const

// Newer browsers report it on adapter.info, older ones on the adapter itself.
type Adapter = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } }

/** A hardware WebGPU adapter is there. Checked before anything mounts. */
export async function webgpuReady(): Promise<boolean> {
  if (!navigator.gpu) return false
  try {
    const adapter = (await navigator.gpu.requestAdapter({ powerPreference: POWER_PREFERENCE })) as Adapter | null
    if (!adapter) return false
    // A software rasteriser (e.g. SwiftShader) is WebGPU in name only.
    return !(adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter)
  } catch {
    return false
  }
}

let onFail = () => {}

/** main.tsx: what to do if the renderer can't get WebGPU after all. */
export function onWebgpuFailed(fn: () => void) {
  onFail = fn
}

/** The renderer couldn't start on WebGPU (the device request failed, say). */
export function webgpuFailed() {
  onFail()
}
