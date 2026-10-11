// The brand palette, in one place. Everything colourful in the app derives from
// these through the scheme engine (src/color/scheme.ts), which also guards any
// colours the agent picks at runtime.
//
// Designer palette (Oct 2026): indigo, amber, rose, crimson, turquoise.
// Sampled from the swatch image; replace with the designer's exact hex codes.

export const BRAND = {
  indigo: '#3F3E6F',
  amber: '#FFBE0B',
  rose: '#E3425F',
  crimson: '#DE2B52',
  turquoise: '#2EDDBA',
} as const

/** Tints and shades of the brand hues, for range (orb emotions, weather skies). */
export const EXT = {
  lavender: '#8F8CC7',
  indigoDeep: '#26254A',
  ink: '#1A1936',
  mist: '#8C8BAE',
  butter: '#FFE08A',
  blush: '#F59AAE',
  mint: '#9EF0DD',
  tealDeep: '#14A88B',
  ice: '#EEF0FA',
} as const

/**
 * What each colour means in the UI. Values are CSS variables written by the
 * scheme engine: `--role-*` is the colour itself (fills, glows, washes; ≥3:1 on
 * the background) and `--ink-*` its readable text form (≥4.5:1). Both follow
 * the theme and the agent's colour choices, and cross-fade when either changes.
 */
const role = (name: string) => `var(--role-${name})`

export const ROLE = {
  urgent: role('urgent'),
  kind: {
    task: role('task'),
    event: role('event'),
    notification: role('reminder'),
    goal: role('goal'),
  },
  /** Urgency heat for priority cards: calm → pressing. */
  heat: { calm: role('calm'), mid: role('mid'), urgent: role('urgent') },
  agent: role('agent'),
  finds: role('finds'),
  status: { ok: role('calm'), busy: role('accent'), warn: role('urgent') },
  onImage: '#FBF9F4',
  onImageTag: BRAND.amber,
  findsFallback: `linear-gradient(135deg, ${role('agent')}, ${role('finds')} 55%, ${role('mid')})`,
} as const

/** The readable text form of a role colour (`var(--role-x)` → `var(--ink-x)`); other colours pass through. */
export const inkOf = (color: string) => color.replace('var(--role-', 'var(--ink-')
