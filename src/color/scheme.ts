import { BRAND } from '../ui/brand'
import { clamp, contrast, deltaE, ensureContrast, hexToOklch, hueDiff, type Oklch, oklchToHex, rgba } from './oklch'

/**
 * The colour scheme engine. Brand colours and anything Wendy asks for go in;
 * a complete, accessible scheme for both themes comes out. Guardrails, all
 * in OKLCH so a correction keeps the colour recognisable:
 *
 * 1. Gamut: out-of-sRGB colours lose chroma, never hue or lightness.
 * 2. Bands: role colours stay in a lightness/chroma window (no grey mush, no
 *    neon that vibrates); surfaces stay near-neutral (chroma ≤ 0.014 by day,
 *    ≤ 0.05 at dusk) so cards and text always read.
 * 3. Meaning: `urgent` must be a warm red/orange hue; `calm` may never be one.
 * 4. Separation: the urgency heat (calm/mid/urgent) and the four item kinds
 *    stay ≥ ΔE 0.09 apart, rotating hue where two collide.
 * 5. Contrast (WCAG 2): roles ≥ 3:1 on the background, ink ≥ 4.5:1, text
 *    ≥ 7:1, muted ≥ 4.5:1; button text picks whichever of light/dark wins.
 *
 * Anything adjusted is reported in `notes`, so Wendy learns what happened.
 */

export const ROLES = ['accent', 'urgent', 'mid', 'calm', 'task', 'event', 'reminder', 'goal', 'wendy', 'finds'] as const
export type Role = (typeof ROLES)[number]
type Theme = 'day' | 'dusk'
export type Harmony = 'analogous' | 'complementary' | 'triadic' | 'split'
const HARMONIES: Harmony[] = ['analogous', 'complementary', 'triadic', 'split']

export interface SchemeInput extends Partial<Record<Role, string>> {
  /** One colour to build a harmonious scheme around (accent, tasks, surface tint). */
  seed?: string
  harmony?: Harmony
  /** Hue for the surfaces (background, glass, text tint). */
  neutral?: string
  /** 2–6 colours for the ambient background blobs. */
  ambient?: string[]
  /** 1–3 colours for the orb at rest. */
  orb?: string[]
}

interface Surface {
  bg: string
  bg2: string
  text: string
  strong: string
  muted: string
  faint: string
  line: string
  scrim: string
  glass: string
  glassThick: string
  shade: string
  drop: string
}

export interface Applied {
  surface: Surface
  role: Record<Role, string>
  ink: Record<Role, string>
  onAccent: string
  ambient: string[] | null
}

export interface Scheme {
  base: Record<Role, string>
  neutral: string
  orb: string[] | null
  day: Applied
  dusk: Applied
  notes: string[]
}

const BRAND_INPUT: Required<Omit<SchemeInput, 'seed' | 'harmony' | 'ambient' | 'orb'>> = {
  accent: BRAND.turquoise,
  urgent: BRAND.crimson,
  mid: BRAND.amber,
  calm: BRAND.turquoise,
  task: BRAND.turquoise,
  event: BRAND.indigo,
  reminder: BRAND.rose,
  goal: BRAND.amber,
  wendy: BRAND.indigo,
  finds: BRAND.rose,
  neutral: BRAND.indigo,
}

const ROLE_L: [number, number] = [0.4, 0.9]
const ROLE_C: [number, number] = [0.05, 0.24]
const MIN_SEPARATION = 0.09
/** Warm hues that read as "act now": magenta-red through orange. */
const URGENT_HUES: [number, number] = [350, 70]
const DISTINCT: Role[][] = [
  ['calm', 'mid', 'urgent'],
  ['task', 'event', 'reminder', 'goal'],
]

const inArc = (h: number, [from, to]: [number, number]) => (from <= to ? h >= from && h <= to : h >= from || h <= to)
const hex = (c: Oklch) => oklchToHex(c)

function band(c: Oklch, l: [number, number], ch: [number, number]): Oklch {
  // Near-greys keep their (meaningless) hue; only lift chroma for real colours.
  return { l: clamp(c.l, l[0], l[1]), c: c.c < 0.015 ? c.c : clamp(c.c, ch[0], ch[1]), h: c.h }
}

function rot(h: number, by: number) {
  return (((h + by) % 360) + 360) % 360
}

/** Builds the role inputs from a seed colour and a harmony rule. */
function fromSeed(seed: Oklch, harmony: Harmony): Partial<Record<Role | 'neutral', string>> {
  const at = (by: number, l = seed.l) => hex({ ...seed, l, h: rot(seed.h, by) })
  const [a, b] =
    harmony === 'complementary'
      ? [180, 150]
      : harmony === 'triadic'
        ? [120, 240]
        : harmony === 'split'
          ? [150, 210]
          : [-40, 40]
  const s = hex(seed)
  return { accent: s, task: s, wendy: s, neutral: s, event: at(a), calm: at(a), goal: at(b), mid: at(b) }
}

export function buildScheme(input: SchemeInput = {}): Scheme {
  const notes: string[] = []
  const seed = input.seed ? hexToOklch(String(input.seed)) : null
  if (input.seed && !seed) notes.push(`seed "${input.seed}" isn't a hex colour; ignored`)
  const harmony = input.harmony && HARMONIES.includes(input.harmony) ? input.harmony : 'analogous'

  const merged: Record<string, string> = { ...BRAND_INPUT, ...(seed ? fromSeed(seed, harmony) : {}) }
  for (const key of [...ROLES, 'neutral'] as const) {
    const v = input[key]
    if (v === undefined) continue
    if (hexToOklch(String(v))) merged[key] = String(v)
    else notes.push(`${key} "${String(v)}" isn't a hex colour; kept ${merged[key]}`)
  }

  // 1–3. Gamut, bands, meaning.
  const base = {} as Record<Role, Oklch>
  for (const r of ROLES) {
    const raw = hexToOklch(merged[r]) as Oklch
    let c = band(raw, ROLE_L, ROLE_C)
    if (r === 'urgent' && !inArc(c.h, URGENT_HUES)) {
      const toStart = Math.abs(hueDiff(c.h, URGENT_HUES[0]))
      const toEnd = Math.abs(hueDiff(c.h, URGENT_HUES[1]))
      c = { ...c, h: toStart < toEnd ? URGENT_HUES[0] : URGENT_HUES[1], c: Math.max(c.c, 0.14) }
      notes.push('urgent moved into the red–orange range so it still reads as urgent')
    }
    if (r === 'calm' && inArc(c.h, [5, 60])) {
      c = { ...c, h: 160 }
      notes.push("calm can't be red/orange (that reads as urgent); moved to green")
    }
    if (deltaE(raw, c) > 0.02 && r !== 'urgent' && r !== 'calm') notes.push(`${r} softened to stay legible`)
    base[r] = c
  }

  // 4. Separation inside each group that must be told apart at a glance.
  for (const group of DISTINCT) {
    for (let i = 1; i < group.length; i++) {
      const r = group[i]
      if (r === 'urgent') continue
      let tries = 0
      while (tries < 11 && group.slice(0, i).some((o) => deltaE(base[o], base[r]) < MIN_SEPARATION)) {
        base[r] = { ...base[r], h: rot(base[r].h, 30) }
        tries++
      }
      if (tries) notes.push(`${r} shifted ${tries * 30}° so it doesn't look like ${group.slice(0, i).join('/')}`)
    }
  }
  // Urgent wins its slot: if something else collides with it, that one moves.
  for (const group of DISTINCT.filter((g) => g.includes('urgent'))) {
    for (const r of group) {
      if (r === 'urgent') continue
      let tries = 0
      while (tries < 11 && deltaE(base[r], base.urgent) < MIN_SEPARATION) {
        base[r] = { ...base[r], h: rot(base[r].h, -30) }
        tries++
      }
    }
  }

  const neutral = hexToOklch(merged.neutral) as Oklch
  const baseHex = Object.fromEntries(ROLES.map((r) => [r, hex(base[r])])) as Record<Role, string>

  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : [])
  const ambient = list(input.ambient)
    .map((v) => hexToOklch(String(v)))
    .filter((c): c is Oklch => !!c)
    .slice(0, 6)
  if (input.ambient && ambient.length < 2) notes.push('ambient needs 2–6 hex colours; kept the weather sky')
  const orbIn = list(input.orb)
    .map((v) => hexToOklch(String(v)))
    .filter((c): c is Oklch => !!c)
    .slice(0, 3)

  return {
    base: baseHex,
    neutral: hex(neutral),
    orb: orbIn.length ? [0, 1, 2].map((i) => hex(band(orbIn[i % orbIn.length], [0.55, 0.95], [0.04, 0.22]))) : null,
    day: applyTheme('day', base, neutral, ambient.length >= 2 ? ambient : null),
    dusk: applyTheme('dusk', base, neutral, ambient.length >= 2 ? ambient : null),
    notes: [...new Set(notes)],
  }
}

function surfaceFor(theme: Theme, n: Oklch): Surface {
  const at = (l: number, c: number) => hex({ l, c, h: n.h })
  if (theme === 'day') {
    const tint = Math.min(n.c * 0.25, 0.014)
    const bg = at(0.968, tint)
    const strong = at(0.22, Math.min(n.c * 0.6, 0.06))
    const text = ensureContrast(at(0.3, Math.min(n.c * 0.5, 0.05)), bg, 7)
    return {
      bg,
      bg2: at(0.985, tint * 0.5),
      text,
      strong,
      muted: ensureContrast(at(0.5, Math.min(n.c * 0.4, 0.035)), bg, 4.5),
      faint: ensureContrast(at(0.72, 0.02), bg, 2.2),
      line: rgba(text, 0.12),
      scrim: rgba(bg, 0.55),
      glass: 'rgb(255 255 255 / 0.55)',
      glassThick: 'rgb(255 255 255 / 0.85)',
      shade: rgba(text, 0.08),
      drop: rgba(text, 0.16),
    }
  }
  const tint = Math.min(n.c * 0.7, 0.05)
  const bg = at(0.225, tint)
  const text = at(0.95, 0.012)
  return {
    bg,
    bg2: at(0.275, tint),
    text,
    strong: at(0.995, 0.004),
    muted: ensureContrast(at(0.77, 0.03), bg, 4.5),
    faint: ensureContrast(at(0.58, 0.03), bg, 2.2),
    line: rgba(text, 0.1),
    scrim: rgba(at(0.16, tint), 0.55),
    glass: rgba(at(0.62, Math.min(n.c, 0.08)), 0.14),
    glassThick: rgba(at(0.26, tint), 0.84),
    shade: rgba(at(0.1, tint), 0.4),
    drop: rgba(at(0.1, tint), 0.6),
  }
}

function applyTheme(theme: Theme, base: Record<Role, Oklch>, neutral: Oklch, ambient: Oklch[] | null): Applied {
  const surface = surfaceFor(theme, neutral)
  const role = {} as Record<Role, string>
  const ink = {} as Record<Role, string>
  for (const r of ROLES) {
    role[r] = ensureContrast(hex(base[r]), surface.bg, 3)
    ink[r] = ensureContrast(role[r], surface.bg, 4.5)
  }
  const accent = role.accent
  const dark = theme === 'day' ? surface.strong : surface.bg
  const onAccent = contrast(accent, '#ffffff') >= contrast(accent, dark) ? '#ffffff' : dark
  const amb = ambient
    ? [0, 1, 2, 3].map((i) => {
        const c = ambient[i % ambient.length]
        return theme === 'day' ? hex(band(c, [0.72, 0.93], [0, 0.15])) : hex(band(c, [0.38, 0.68], [0, 0.16]))
      })
    : null
  return { surface, role, ink, onAccent, ambient: amb }
}

const SURFACE_VARS: Record<keyof Surface, string> = {
  bg: '--t-bg',
  bg2: '--t-bg-2',
  text: '--t-text',
  strong: '--t-strong',
  muted: '--t-muted',
  faint: '--t-faint',
  line: '--t-line',
  scrim: '--t-scrim',
  glass: '--t-glass',
  glassThick: '--t-glass-thick',
  shade: '--t-shade',
  drop: '--t-drop',
}

/** Every colour variable the scheme writes (registered as animatable <color>s). */
export const SCHEME_VARS = [
  ...Object.values(SURFACE_VARS),
  ...ROLES.flatMap((r) => [`--role-${r}`, `--ink-${r}`]),
  '--on-accent',
]

function block(a: Applied): string {
  const lines = [
    ...Object.entries(SURFACE_VARS).map(([k, v]) => `${v}:${a.surface[k as keyof Surface]}`),
    ...ROLES.flatMap((r) => [`--role-${r}:${a.role[r]}`, `--ink-${r}:${a.ink[r]}`]),
    `--on-accent:${a.onAccent}`,
  ]
  return lines.join(';')
}

/** The scheme as CSS, scoped to each theme (beats the static fallbacks in index.css). */
export function schemeCss(s: Scheme): string {
  return [
    `html:root,html:root[data-theme='day']{${block(s.day)}}`,
    `html:root[data-theme='dusk']{${block(s.dusk)}}`,
    `html:root{transition:${[
      ...SCHEME_VARS.map((v) => `${v} 1.2s ease`),
      ...MOOD_VARS.map((v) => `${v} 1.8s ease`),
      '--mood-glow 1.8s ease',
    ].join(',')}}`,
  ].join('\n')
}

/** Mood light (written by MoodLight): animatable so a change of mood fades instead of jumping. */
export const MOOD_VARS = ['--mood-1', '--mood-2']

/** A compact summary for Wendy's screen snapshot. */
export function describeScheme(s: Scheme, source: 'brand' | 'wendy') {
  return { source, roles: s.base, neutral: s.neutral, ambient: !!s.day.ambient, orb: s.orb, notes: s.notes }
}
