import { useEffect, useState } from 'react'
import { useUi } from '../stores/ui'
import { isDaylight, useSky } from '../weather/sky'

export type ResolvedTheme = 'day' | 'dusk'

const THEME_COLOR: Record<ResolvedTheme, string> = { day: '#EFE6C8', dusk: '#1D2B30' }

/** Current theme: Wendy's or the user's override, else the sun at the user's location. */
export function useTheme(): ResolvedTheme {
  const mode = useUi((s) => s.theme)
  const sky = useSky()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  if (mode !== 'auto') return mode
  return isDaylight(sky, now) ? 'day' : 'dusk'
}

/** Applies the theme to <html> (CSS tokens cross-fade) and the browser chrome colour. */
export function useThemeSync(): ResolvedTheme {
  const theme = useTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  }, [theme])
  return theme
}
