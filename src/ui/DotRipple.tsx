/**
 * A ripple made of tiny circles: rings of dots that expand outward from the
 * centre and fade, one after another, like rings on water. Used for the agent's
 * thinking line and around the orb. Pure CSS (ripple-ring in index.css), so it
 * runs even inside AnimatePresence(initial=false), and stays still under
 * reduced motion.
 */
export function DotRipple({
  rings = 3,
  dots = 12,
  dotR = 2.6,
  seconds = 1.6,
  from = 0.15,
  center = false,
  className = '',
  style,
}: {
  rings?: number
  dots?: number
  /** Dot radius in viewBox units (the box is 100 across). */
  dotR?: number
  /** One ring's journey outward. */
  seconds?: number
  /** How small a ring starts (fraction of full size). */
  from?: number
  /** A small pulsing dot at the centre the rings come from. */
  center?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="0 0 100 100" className={`overflow-visible ${className}`} style={style} aria-hidden>
      {Array.from({ length: rings }, (_, ring) => (
        <g
          key={ring}
          className="ripple-ring"
          style={
            {
              '--from': from,
              animationDuration: `${seconds}s`,
              animationDelay: `${(ring * seconds) / rings}s`,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: dots }, (_, i) => {
            // Each ring is turned half a step from the last, so they interleave.
            const a = ((i + (ring % 2) * 0.5) / dots) * Math.PI * 2
            return <circle key={i} cx={50 + Math.cos(a) * 46} cy={50 + Math.sin(a) * 46} r={dotR} fill="currentColor" />
          })}
        </g>
      ))}
      {center && <circle className="ripple-core" cx={50} cy={50} r={dotR * 1.5} fill="currentColor" />}
    </svg>
  )
}
