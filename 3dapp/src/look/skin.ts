import * as THREE from 'three/webgpu'
import { dot, float, mix, normalView, normalWorld, positionViewDirection, pow, sin, smoothstep, uniform } from 'three/tsl'
import { orbSignals, useAgent } from '@actora/stores/agent'
import { useScheme } from '@actora/stores/scheme'
import { moodIntensity, orbColors } from '@actora/ui/palette'
import { damp } from './motion'

/**
 * Her body is the 2D orb: the same three colours (a body colour, a softer lighter
 * one, a near-white highlight), from the same place. At rest they're her own
 * colour (the brand pink, or the orb colours of a scheme the agent chose); a
 * feeling moves them toward its colours, as it moves the orb. She breathes: a
 * slow glow that quickens and brightens as she feels more, or as she talks.
 */
const u = {
  body: uniform(new THREE.Color()),
  soft: uniform(new THREE.Color()),
  rim: uniform(new THREE.Color()),
  /** 0..1: how strongly she feels (and speaks) right now. */
  glow: uniform(0),
  /** Breathing phase, radians (advanced in JS so its pace can change smoothly). */
  breath: uniform(0),
}

export function skinMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 })
  // Lighter where she faces up (shoulders, head), like the orb's soft top.
  m.colorNode = mix(u.body, u.soft, smoothstep(-0.1, 1, normalWorld.y).mul(0.35))
  const breathe = sin(u.breath).mul(0.5).add(0.5)
  const fresnel = pow(float(1).sub(dot(normalView, positionViewDirection).clamp(0, 1)), 3)
  m.emissiveNode = u.rim
    .mul(fresnel.mul(u.glow.mul(0.3).add(0.18)))
    .add(u.body.mul(breathe.mul(u.glow.mul(0.12).add(0.05))))
  return m
}

const REST = ['#f52393', '#ff7ab8', '#ffe1ee'] as const
const rest = REST.map((c) => new THREE.Color(c))
const target = [new THREE.Color(), new THREE.Color(), new THREE.Color()]
const scratch = new THREE.Color()
let memo: { mood: unknown; emotion: unknown; scheme: unknown; intensity: number } | null = null
let first = true

/** Ease her colours and breathing toward her mood; once a frame. */
export function updateSkin(dt: number): void {
  const { mood, emotion } = useAgent.getState()
  const { scheme, source } = useScheme.getState()
  if (!memo || memo.mood !== mood || memo.emotion !== emotion || memo.scheme !== scheme) {
    const intensity = moodIntensity(mood, emotion)
    const feeling = orbColors(mood, emotion, scheme)
    // A chosen scheme's resting orb is hers; the brand's is the pink.
    const own = source === 'agent' ? orbColors(null, {}, scheme) : null
    for (let i = 0; i < 3; i++) {
      if (own) target[i].setRGB(own[i][0], own[i][1], own[i][2], THREE.SRGBColorSpace)
      else target[i].copy(rest[i])
      if (intensity > 0) {
        scratch.setRGB(feeling[i][0], feeling[i][1], feeling[i][2], THREE.SRGBColorSpace)
        target[i].lerpHSL(scratch, Math.min(0.75, 0.25 + intensity * 0.55))
      }
    }
    memo = { mood, emotion, scheme, intensity }
  }
  // About a second to change colour, like the 2D orb.
  const k = first ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 2.2)
  first = false
  u.body.value.lerp(target[0], k)
  u.soft.value.lerp(target[1], k)
  u.rim.value.lerp(target[2], k)
  const live = Math.min(1, memo.intensity + orbSignals.energy * 0.5)
  u.glow.value = damp(u.glow.value, live, 3, dt)
  // A slow breath at rest (about 5 s), quicker as she feels or speaks.
  u.breath.value = (u.breath.value + dt * (1.25 + u.glow.value * 2.2)) % (Math.PI * 2)
}
