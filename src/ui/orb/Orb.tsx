import { useEffect, useRef, useState } from 'react'
import { webgpuReady } from '../../gpu'
import { OrbFallback } from './OrbFallback'

/** How long the WebGPU orb takes to fade in over the CSS one. */
const FADE_MS = 400

// One adapter check per page: the orb mounts on sign-in and again at home.
let gpu: Promise<boolean> | undefined

/**
 * Her orb, drawn on WebGPU by a TSL shader (gpuOrb.ts). Without WebGPU, or
 * until its first frame, it's the CSS orb: no WebGL (docs/agents/graphics.md).
 */
export function Orb() {
  const host = useRef<HTMLDivElement>(null)
  // 'css' until the WebGPU orb is on screen; 'gpu' once it has faded in.
  const [shown, setShown] = useState<'css' | 'fading' | 'gpu'>('css')

  useEffect(() => {
    const el = host.current
    if (!el) return
    let stop: (() => void) | null = null
    let dead = false
    let fade = 0
    void (async () => {
      if (!(await (gpu ??= webgpuReady('low-power'))) || dead) return
      const { startOrb } = await import('./gpuOrb')
      if (dead) return
      stop = await startOrb(el, () => {
        setShown('fading')
        fade = window.setTimeout(() => setShown('gpu'), FADE_MS)
      })
      if (dead) stop?.()
    })()
    return () => {
      dead = true
      window.clearTimeout(fade)
      stop?.()
    }
  }, [])

  return (
    <>
      {shown !== 'gpu' && <OrbFallback />}
      <div
        ref={host}
        className="absolute inset-0"
        style={{ opacity: shown === 'css' ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}
        aria-hidden
      />
    </>
  )
}
