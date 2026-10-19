/**
 * WebGPU on real hardware, or nothing. No WebGL, and no software (fallback)
 * adapter: Actora draws with WebGPU and TSL only (docs/agents/graphics.md).
 * Shared by the 2D orb and the 3D app.
 */

// Newer browsers report it on adapter.info, older ones on the adapter itself.
type Adapter = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } }

/** A hardware WebGPU adapter is there. */
export async function webgpuReady(powerPreference: GPUPowerPreference = 'high-performance'): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.gpu) return false
  try {
    const adapter = (await navigator.gpu.requestAdapter({ powerPreference })) as Adapter | null
    if (!adapter) return false
    // A software rasteriser (e.g. SwiftShader) is WebGPU in name only.
    return !(adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter)
  } catch {
    return false
  }
}
