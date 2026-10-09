import type { SupabaseClient } from '@supabase/supabase-js'
import type { SchemeInput } from '../color/scheme'
import { resetColors, restoreColors, useScheme } from './scheme'
import { useUi, type ThemeMode } from './ui'

/**
 * How the app looks (day/dusk/auto, and Wendy's colours) follows the user, not
 * the browser: saved to their Supabase user_metadata, which the signed-in user
 * can write and every device reads at sign-in. The theme is also kept locally
 * so the first paint is already right.
 */
const META_KEY = 'actora_appearance'
const THEME_KEY = 'actora.theme.v1'
const MODES = new Set<ThemeMode>(['auto', 'day', 'dusk'])

interface Saved {
  theme?: ThemeMode
  /** Wendy's palette and when it expires; null means the brand palette. */
  colors?: { input: SchemeInput; until: number } | null
  at?: number
}

/** Before first render: the theme this browser last had (no flash back to auto). */
export function restoreLocalTheme(): void {
  try {
    const t = localStorage.getItem(THEME_KEY) as ThemeMode | null
    if (t && MODES.has(t)) useUi.setState({ theme: t })
  } catch {
    /* private mode */
  }
  useUi.subscribe((s, p) => {
    if (s.theme === p.theme) return
    try {
      localStorage.setItem(THEME_KEY, s.theme)
    } catch {
      /* private mode */
    }
  })
}

/** Whose look this browser's local theme and colours are. */
const OWNER_KEY = 'actora.look.owner.v1'
const readOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}
const writeOwner = (id: string) => {
  try {
    localStorage.setItem(OWNER_KEY, id)
  } catch {
    /* private mode */
  }
}

/** Pull the user's saved look once, then push every change (debounced). */
export function startAppearanceSync(sb: SupabaseClient): () => void {
  let applying = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const snapshot = (): Saved => {
    const s = useScheme.getState()
    return {
      theme: useUi.getState().theme,
      colors: s.source === 'wendy' && s.input && s.until ? { input: s.input, until: s.until } : null,
      at: Date.now(),
    }
  }

  const push = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void sb.auth.updateUser({ data: { [META_KEY]: snapshot() } }).then(({ error }) => {
        if (error) console.warn(`[appearance] not saved: ${error.message}`)
      })
    }, 800)
  }

  // Fresh from the server (the cached session can be stale if another device changed it).
  void sb.auth
    .getUser()
    .then(({ data }) => {
      if (stopped) return
      // getUser resolves (not rejects) with no user on failure: treat that as unknown too.
      if (!data.user) throw new Error('no user')
      // Someone else signed in on this browser: drop the last person's look first,
      // so a user with nothing saved gets the defaults, not theirs.
      const uid = data.user?.id
      if (uid && readOwner() !== uid) {
        if (readOwner()) {
          useUi.setState({ theme: 'auto' })
          if (useScheme.getState().source === 'wendy') resetColors()
        }
        writeOwner(uid)
      }
      const saved = data.user?.user_metadata?.[META_KEY] as Saved | undefined
      if (!saved) return
      if (saved.theme && MODES.has(saved.theme)) useUi.setState({ theme: saved.theme })
      if (saved.colors && saved.colors.until > Date.now()) restoreColors(saved.colors.input, saved.colors.until)
      else if (saved.colors === null || (saved.colors && saved.colors.until <= Date.now())) {
        if (useScheme.getState().source === 'wendy') resetColors()
      }
    })
    .then(
      () => {
        applying = false
      },
      // Couldn't tell whose account this is: don't save this browser's look into it
      // (it may be the last person's). Changes still apply locally.
      () => {},
    )

  const offUi = useUi.subscribe((s, p) => {
    if (!applying && s.theme !== p.theme) push()
  })
  const offScheme = useScheme.subscribe((s, p) => {
    if (!applying && s.scheme !== p.scheme) push()
  })

  return () => {
    stopped = true
    clearTimeout(timer)
    offUi()
    offScheme()
  }
}
