import { useEffect, useState } from 'react'
import { blobColor, randomLayout } from './palette'
import { useSky, watchSky } from './sky'

/**
 * Drifting, pre-blurred colour field behind the glass. The layout is random on
 * every load; the colours follow the local weather and cross-fade when it changes.
 */
export function Ambient() {
  const sky = useSky()
  const [layout] = useState(() => randomLayout())

  useEffect(() => watchSky(), [])

  return (
    <div className={`ambient sky-${sky.kind}`} aria-hidden>
      {layout.map((b, i) => (
        <i
          key={i}
          style={
            {
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.size}vmax`,
              height: `${b.size}vmax`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
              '--c': blobColor(sky, b.slot),
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
