import { create } from 'zustand'
import { buildScheme, type Scheme, type SchemeInput, SCHEME_VARS, schemeCss } from '../color/scheme'

/**
 * The live colour scheme: the brand by default, or Wendy's (guarded) choice.
 * Wendy's scheme persists across reloads until it expires (default 8 h, so a
 * mood palette doesn't outlive the mood) or she / the user resets it.
 */
interface SchemeState {
  source: 'brand' | 'wendy'
  input: SchemeInput | null
  until: number | null
  scheme: Scheme
}

const KEY = 'actora.scheme.v1'
const DEFAULT_HOURS = 8
const MAX_HOURS = 24 * 7
const BRAND_SCHEME = buildScheme()

export const useScheme = create<SchemeState>(() => ({
  source: 'brand',
  input: null,
  until: null,
  scheme: BRAND_SCHEME,
}))

let expiry: ReturnType<typeof setTimeout> | undefined

function save(s: SchemeState) {
  try {
    if (s.source === 'wendy') localStorage.setItem(KEY, JSON.stringify({ input: s.input, until: s.until }))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the scheme just won't survive a reload */
  }
}

function schedule(until: number | null) {
  clearTimeout(expiry)
  if (until) expiry = setTimeout(resetColors, Math.max(0, until - Date.now()))
}

/** Wendy's `colors.set`. Returns what the guardrails changed, for her to hear back. */
export function setColors(input: SchemeInput, hours?: number): string[] {
  const merged = { ...(useScheme.getState().input ?? {}), ...input }
  const scheme = buildScheme(merged)
  const h = typeof hours === 'number' && hours > 0 ? Math.min(hours, MAX_HOURS) : DEFAULT_HOURS
  const next: SchemeState = { source: 'wendy', input: merged, until: Date.now() + h * 3_600_000, scheme }
  useScheme.setState(next)
  save(next)
  schedule(next.until)
  return scheme.notes
}

export function resetColors(): void {
  const next: SchemeState = { source: 'brand', input: null, until: null, scheme: BRAND_SCHEME }
  useScheme.setState(next)
  save(next)
  schedule(null)
}

function register() {
  if (!('registerProperty' in CSS)) return
  for (const name of SCHEME_VARS) {
    try {
      CSS.registerProperty({ name, syntax: '<color>', inherits: true, initialValue: 'transparent' })
    } catch {
      /* already registered (index.css or a hot reload) */
    }
  }
}

/** Starts the scheme: restores Wendy's saved palette, writes CSS, keeps it in sync. */
export function initScheme(): void {
  register()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { input: SchemeInput; until: number } | null
    if (saved && saved.until > Date.now()) {
      useScheme.setState({ source: 'wendy', input: saved.input, until: saved.until, scheme: buildScheme(saved.input) })
      schedule(saved.until)
    }
  } catch {
    /* corrupt or blocked storage: brand it is */
  }

  const el = (document.getElementById('scheme') as HTMLStyleElement | null) ?? document.createElement('style')
  el.id = 'scheme'
  if (!el.isConnected) document.head.appendChild(el)
  const write = (s: Scheme) => {
    el.textContent = schemeCss(s)
  }
  write(useScheme.getState().scheme)
  useScheme.subscribe((s, p) => s.scheme !== p.scheme && write(s.scheme))
}
