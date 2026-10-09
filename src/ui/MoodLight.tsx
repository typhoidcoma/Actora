import { useEffect } from 'react'
import { useAgent } from '../stores/agent'
import { useMetrics } from '../stores/metrics'
import { css, orbColors } from './palette'

/**
 * The orb's light, spilling onto the glass from behind the grid. The tiles'
 * backdrop blur picks it up, so their inner corners glow in Wendy's mood.
 * Also publishes --mood-1/--mood-2 for any other surface that wants them.
 */
export function MoodLight() {
  const m = useMetrics()
  const mood = useAgent((s) => s.mood)
  const emotion = useAgent((s) => s.emotion)
  const offline = useAgent((s) => s.phase === 'offline')

  useEffect(() => {
    const [c1, c2] = orbColors(mood, emotion)
    const root = document.documentElement.style
    root.setProperty('--mood-1', offline ? 'rgb(140 150 148)' : css(c1))
    root.setProperty('--mood-2', offline ? 'rgb(110 120 120)' : css(c2))
  }, [mood, emotion, offline])

  const d = m.orb * 2.2
  return <div className="spill" aria-hidden style={{ left: m.cx - d / 2, top: m.cy - d / 2, width: d, height: d }} />
}
