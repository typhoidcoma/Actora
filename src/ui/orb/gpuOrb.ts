import * as THREE from 'three/webgpu'
import { orbSignals, useAgent, type AgentState, type Reaction } from '../../stores/agent'
import { useOptionsStore } from '../../stores/options'
import { useScheme } from '../../stores/scheme'
import { orbColors, type Triad } from '../palette'
import { orbFragment, orbUniforms } from './shader'

// The orb on WebGPU, drawn by a TSL shader (shader.ts). Loaded on its own (Orb.tsx
// imports it lazily), so three/webgpu stays out of the first paint.

interface Targets {
  speed: number
  amp: number
  swirl: number
  glow: number
  desat: number
}

const LISTENING: Targets = { speed: 0.8, amp: 0.085, swirl: 0.5, glow: 0.75, desat: 0 }

function phaseTargets(s: AgentState): Targets {
  switch (s.phase) {
    case 'offline':
      return { speed: 0.12, amp: 0.03, swirl: 0.1, glow: 0.18, desat: 0.85 }
    case 'thinking':
      return { speed: 0.95, amp: 0.07, swirl: 1.1, glow: 0.6, desat: 0 }
    case 'tool':
      // No spinning ring: the ripple of tiny circles round the orb (OrbDock) shows tool work.
      return { speed: 0.7, amp: 0.06, swirl: 0.8, glow: 0.55, desat: 0 }
    case 'speaking':
      return { speed: 0.55, amp: 0.06, swirl: 0.35, glow: 0.6, desat: 0 }
    default:
      // Idle is alive, not static: a slow lava-lamp churn.
      return { speed: 0.45, amp: 0.065, swirl: 0.28, glow: 0.48, desat: 0 }
  }
}

/** Reaction envelope: fast attack, hold, smooth release over holdMs. */
function reactionAt(r: Reaction | null, now: number): { react: number; wobble: number } {
  if (!r) return { react: 0, wobble: 0 }
  const t = (now - r.at) / Math.max(400, r.holdMs)
  if (t < 0 || t > 1) return { react: 0, wobble: 0 }
  const env = Math.min(1, t * 8) * (1 - Math.pow(t, 3))
  const k = env * r.intensity
  if (r.bus === 'negative') return { react: -k, wobble: 0 }
  if (r.bus === 'cognitive') return { react: 0, wobble: k }
  return { react: k, wobble: 0 }
}

/** The triad rotated by a continuous phase in [0, 3): a slow hue drift through the mood colours. */
function rotate(colors: Triad, phase: number, out: Triad): Triad {
  const k = ((Math.floor(phase) % 3) + 3) % 3
  const f = phase - Math.floor(phase)
  const t = f * f * (3 - 2 * f)
  for (let i = 0; i < 3; i++) {
    const a = colors[(i + k) % 3]
    const b = colors[(i + k + 1) % 3]
    for (let c = 0; c < 3; c++) out[i][c] = a[c] + (b[c] - a[c]) * t * 0.55
  }
  return out
}

const BREATH_S = 5
const HUE_CYCLE_S = 20

const isDay = () => (document.documentElement.dataset.theme === 'dusk' ? 0 : 1)

/**
 * Draw the orb into el. Resolves to its stop function, or null when WebGPU
 * won't start (Orb.tsx then keeps the CSS orb). onShown runs after the first
 * frame is on screen.
 */
export async function startOrb(el: HTMLElement, onShown: () => void): Promise<(() => void) | null> {
  // It's small: the integrated GPU will do, and spares the battery.
  const renderer = new THREE.WebGPURenderer({
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  })
  // three quietly drops to its WebGL2 backend if WebGPU won't start; we'd rather show the CSS orb.
  ;(renderer as unknown as { _getFallback: null })._getFallback = null
  try {
    await renderer.init()
    if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) throw new Error('not WebGPU')
  } catch {
    renderer.dispose()
    return null
  }
  // The shader writes final, premultiplied colours: no colour-space conversion, no tone mapping.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))

  const u = orbUniforms()
  u.day.value = isDay()
  const material = new THREE.NodeMaterial()
  material.fragmentNode = orbFragment(u)
  material.blending = THREE.NoBlending
  material.depthTest = false
  material.depthWrite = false
  material.toneMapped = false
  const quad = new THREE.QuadMesh(material)

  const canvas = renderer.domElement
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'

  // Layout size, not getBoundingClientRect: the orb is often mid-transform
  // (entrance scale, docking), and the canvas must match the untransformed box.
  const resize = () => {
    const width = el.clientWidth
    const height = el.clientHeight
    if (width > 0 && height > 0) renderer.setSize(width, height, false)
  }
  resize()
  // Build the pipeline before the first frame, so the orb never hitches in.
  try {
    await renderer.compileAsync(quad, quad.camera)
  } catch {
    material.dispose()
    renderer.dispose()
    return null
  }
  el.appendChild(canvas)
  const ro = new ResizeObserver(resize)
  ro.observe(el)

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Colours only change when mood/emotion change; recompute lazily.
  let colors: Triad = orbColors(useAgent.getState().mood, useAgent.getState().emotion)
  const unsubAgent = useAgent.subscribe((s, p) => {
    if (s.mood !== p.mood || s.emotion !== p.emotion) colors = orbColors(s.mood, s.emotion)
  })
  const unsubScheme = useScheme.subscribe((s, p) => {
    if (s.scheme !== p.scheme) colors = orbColors(useAgent.getState().mood, useAgent.getState().emotion)
  })

  const drifted: Triad = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const tints = [u.c1.value, u.c2.value, u.c3.value]
  // Spontaneous idle beats: a small glance or flare every 8–18 s.
  let beat: Reaction | null = null
  let nextBeat = performance.now() + 6000 + Math.random() * 6000

  let speed = 0.2
  let raf = 0
  let shown = false
  let last = performance.now()
  const start = last
  const ease = (cur: number, target: number, rate: number, dt: number) =>
    cur + (target - cur) * (1 - Math.exp(-rate * dt))

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    // rAF timestamps can precede the performance.now() taken at setup, so the
    // first dt can be negative; that would make every ease diverge.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
    last = now
    const s = useAgent.getState()
    const listening = useOptionsStore.getState().listening
    // Listening: alert and open, swelling with each word heard.
    const tg = listening ? LISTENING : phaseTargets(s)
    if (!reduced && s.phase === 'idle' && now >= nextBeat) {
      beat = {
        bus: Math.random() < 0.5 ? 'cognitive' : 'positive',
        state: 'idle',
        intensity: 0.25 + Math.random() * 0.15,
        holdMs: 1100 + Math.random() * 600,
        at: now,
      }
      nextBeat = now + 8000 + Math.random() * 10_000
    } else if (s.phase !== 'idle') {
      nextBeat = Math.max(nextBeat, now + 4000)
    }
    const a = reactionAt(s.reaction, now)
    const b = reactionAt(beat, now)
    const react = Math.abs(a.react) >= Math.abs(b.react) ? a.react : b.react
    const wobble = Math.max(a.wobble, b.wobble)

    orbSignals.energy *= Math.exp(-dt * 3.2)
    const energy = s.phase === 'speaking' || listening ? orbSignals.energy : 0

    speed = ease(speed, (reduced ? 0.3 : 1) * tg.speed + energy * 0.6, 3, dt)
    u.time.value += dt * speed
    u.clock.value = (now - start) / 1000
    u.amp.value = ease(u.amp.value, tg.amp + energy * 0.07 + Math.abs(react) * 0.03, 6, dt)
    u.swirl.value = ease(u.swirl.value, tg.swirl, 2.5, dt)
    u.glow.value = ease(u.glow.value, tg.glow + energy * 0.35 + Math.max(0, react) * 0.4, 5, dt)
    u.desat.value = ease(u.desat.value, tg.desat, 2.5, dt)
    u.react.value = ease(u.react.value, react, 14, dt)
    u.wobble.value = ease(u.wobble.value, wobble, 8, dt)
    u.energy.value = ease(u.energy.value, energy, 10, dt)
    const clock = Math.max(0, (now - start) / 1000)
    u.breath.value = Math.sin((clock / BREATH_S) * Math.PI * 2) * (reduced ? 0.5 : 1)
    u.day.value = ease(u.day.value, isDay(), 1.5, dt)
    const target = reduced ? colors : rotate(colors, ((clock / HUE_CYCLE_S) * 3) % 3, drifted)
    for (let i = 0; i < 3; i++) {
      const v = tints[i]
      for (let c = 0; c < 3; c++) v.setComponent(c, ease(v.getComponent(c), target[i][c], 2, dt))
    }
    quad.render(renderer)
    if (!shown) {
      shown = true
      onShown()
    }
  }

  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (document.visibilityState === 'visible') {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', onVisibility)
    ro.disconnect()
    unsubAgent()
    unsubScheme()
    canvas.remove()
    material.dispose()
    renderer.dispose()
  }
}
