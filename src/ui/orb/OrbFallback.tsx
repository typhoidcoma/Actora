import { motion } from 'motion/react'
import { useMemo } from 'react'
import { useAgent } from '../../stores/agent'
import { useScheme } from '../../stores/scheme'
import { css, orbColors } from '../palette'

/** CSS-only orb for devices without WebGL. Same colours, simpler motion. */
export function OrbFallback() {
  const mood = useAgent((s) => s.mood)
  const emotion = useAgent((s) => s.emotion)
  const phase = useAgent((s) => s.phase)
  const scheme = useScheme((s) => s.scheme)
  const [c1, c2, c3] = useMemo(() => orbColors(mood, emotion, scheme), [mood, emotion, scheme])
  const busy = phase === 'thinking' || phase === 'tool' || phase === 'speaking'

  return (
    <motion.div
      aria-hidden
      className="absolute inset-[20%] rounded-full"
      style={{
        background: `radial-gradient(circle at 36% 30%, ${css(c3, 0.95)}, ${css(c1)} 38%, ${css(c2)} 72%, ${css(c2, 0.6)})`,
        boxShadow: `0 0 60px 6px ${css(c1, 0.35)}`,
        filter: phase === 'offline' ? 'grayscale(0.85) brightness(0.7)' : undefined,
      }}
      animate={{ scale: busy ? [1, 1.06, 1] : [1, 1.025, 1] }}
      transition={{ duration: busy ? 1.1 : 4, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}
