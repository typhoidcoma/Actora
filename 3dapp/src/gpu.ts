/**
 * WebGPU on real hardware, or nothing. No WebGL2 backend, no software
 * (fallback) adapter: if either is all that's on offer, the app says so
 * (NoWebGPU) instead of running slowly. The check itself is shared with the
 * 2D orb (@actora/gpu).
 */
import { webgpuReady as hardwareWebgpu } from '@actora/gpu'

/** Ask for the fast GPU on machines with two (laptops with a discrete card). */
export const POWER_PREFERENCE = 'high-performance' as const

/** A hardware WebGPU adapter is there. Checked before anything mounts. */
export function webgpuReady(): Promise<boolean> {
  return hardwareWebgpu(POWER_PREFERENCE)
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
