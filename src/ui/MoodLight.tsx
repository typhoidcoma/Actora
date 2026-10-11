import { useEffect } from 'react'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { useScheme } from '../stores/scheme'
import { css, moodIntensity, orbColors } from './palette'

/**
 * The orb's light, spilling onto the glass from behind the grid. The tiles'
 * backdrop blur picks it up, so their inner corners glow in the agent's mood.
 * Also publishes --mood-1/--mood-2 for any other surface that wants them.
 */
export function MoodLight() {
  const m = useMetrics()
  const mood = useAgent((s) => s.mood)
  const emotion = useAgent((s) => s.emotion)
  const offline = useAgent((s) => s.phase === 'offline')
  const scheme = useScheme((s) => s.scheme)

  useEffect(() => {
    const [c1, c2] = orbColors(mood, emotion, scheme)
    const root = document.documentElement.style
    // Registered as animatable colours (stores/scheme.ts), so a new mood fades in.
    root.setProperty('--mood-1', offline ? 'rgb(140 150 148)' : css(c1))
    root.setProperty('--mood-2', offline ? 'rgb(110 120 120)' : css(c2))
    // A strong feeling lights the glass brightly; a faint one barely tints it.
    root.setProperty('--mood-glow', offline ? '0.1' : (0.3 + moodIntensity(mood, emotion) * 0.7).toFixed(2))
  }, [mood, emotion, offline, scheme])

  const d = m.orb * 2.2
  return <div className="spill" aria-hidden style={{ left: m.cx - d / 2, top: m.cy - d / 2, width: d, height: d }} />
}
