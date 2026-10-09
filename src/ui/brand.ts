// The brand palette, in one place. Swap colours here (and the matching CSS
// tokens in styles/index.css); every card, panel, orb and sky reads from this.
//
// Designer palette (Oct 2026): navy, orange, yellow, sage, teal.

export const BRAND = {
  navy: '#233C4B',
  orange: '#FF7D2D',
  yellow: '#FAC846',
  sage: '#A0C382',
  teal: '#5F9B8C',
} as const

/** Tints and shades of the brand hues, for range (orb emotions, weather) and readable text on cream. */
export const EXT = {
  deepTeal: '#3E7466',
  tealLight: '#9CCABD',
  peach: '#FFB27A',
  butter: '#FDE3A0',
  sageLight: '#CFE2BC',
  /** Sage dark enough to read on cream. */
  sageDeep: '#5F8A3F',
  ember: '#E8571C',
  /** Yellow dark enough to read on cream. */
  amber: '#C98A0E',
  ink: '#16293A',
  mist: '#7F96A3',
  cream: '#F7F2E7',
  ice: '#EEF4EF',
} as const

/** What each colour means in the UI. */
export const ROLE = {
  accent: BRAND.teal,
  urgent: BRAND.orange,
  calm: EXT.sageDeep,
  kind: {
    task: BRAND.teal,
    event: EXT.sageDeep,
    notification: BRAND.orange,
    goal: EXT.amber,
  },
  /** Urgency heat for priority cards: calm → pressing. */
  heat: { calm: EXT.sageDeep, mid: EXT.amber, urgent: BRAND.orange },
  wendy: EXT.deepTeal,
  finds: BRAND.orange,
  status: { ok: EXT.sageDeep, busy: BRAND.teal, warn: BRAND.orange },
  onImage: '#FBF8F1',
  onImageTag: BRAND.yellow,
  findsFallback: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.teal} 50%, ${BRAND.orange})`,
  /** Browser chrome colour per theme (matches --t-bg). */
  themeColor: { day: '#F7F2E7', dusk: '#1B2F3B' },
} as const
