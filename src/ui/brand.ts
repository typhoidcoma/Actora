// The brand palette, in one place. Swap colours here (and the matching CSS
// tokens in styles/index.css); every card, panel, orb and sky reads from this.
//
// Agent palette (Oct 2026), sampled from the Wendy character art: periwinkle
// blue, lime, hot pink and deep indigo ink on cream paper. Replace with the
// designer's exact hex codes when they arrive.

export const BRAND = {
  blue: '#5A7BE6',
  /** Lime (key kept as `green` so roles read the same). */
  green: '#B4D03A',
  pink: '#F23D7B',
  /** Deep indigo ink (the dark brand neutral). */
  slate: '#1F2A6B',
} as const

/** Extensions for range (orb emotions, weather), all lifted from the same art. */
export const EXT = {
  violet: '#7A5AD6',
  cyan: '#6FB4F0',
  lime: '#D6E86E',
  rose: '#F79BBE',
  red: '#F0485A',
  navy: '#2A3FA8',
  ice: '#EAF1FF',
  /** Darker lime that stays readable on cream. */
  mint: '#7E9A14',
  slateLight: '#9AA2CC',
  cream: '#F2EEE4',
  blush: '#F6CAD8',
} as const

/** What each colour means in the UI. */
export const ROLE = {
  accent: BRAND.blue,
  urgent: BRAND.pink,
  calm: EXT.mint,
  kind: {
    task: BRAND.blue,
    event: EXT.mint,
    notification: BRAND.pink,
    goal: EXT.violet,
  },
  /** Urgency heat for priority cards: calm → pressing. */
  heat: { calm: EXT.mint, mid: BRAND.blue, urgent: BRAND.pink },
  wendy: EXT.cyan,
  finds: BRAND.pink,
  status: { ok: EXT.mint, busy: BRAND.blue, warn: BRAND.pink },
  onImage: '#FBF9F4',
  onImageTag: EXT.lime,
  findsFallback: `linear-gradient(135deg, ${BRAND.blue}, ${EXT.violet} 50%, ${BRAND.pink})`,
  /** Browser chrome colour per theme (matches --t-bg). */
  themeColor: { day: '#F2EEE4', dusk: '#1B2048' },
} as const
