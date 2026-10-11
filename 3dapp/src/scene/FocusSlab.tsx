import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { useFocused } from '../look/focus'
import { focusLayout } from '../look/layout'
import { px } from '../look/paint'
import { useLook } from '../look/theme'
import { Pane } from './panels/Pane'

/** The 2D panels' corner radius (px), matched by the slab so the swap to DOM is seamless. */
export const FOCUS_RADIUS = 18

/**
 * The glass the open thing lands on: a slab that flies in from her right to the
 * focus panel's spot, the same size on screen as the DOM panel the 2D app then
 * lays over it (Overlay). Its motion is the 3D part; the content is the 2D app's.
 */
export function FocusSlab() {
  const focused = useFocused()
  const look = useLook()
  const size = useThree((s) => s.size)
  const f = focusLayout(size.width / size.height)
  const radius = FOCUS_RADIUS / (size.height / f.view.h)

  // Stay mounted through the exit.
  const [mounted, setMounted] = useState(focused)
  useEffect(() => {
    if (focused) setMounted(true)
  }, [focused])
  if (!mounted) return null

  return (
    <Pane
      width={f.panel.w}
      height={f.panel.h}
      radius={radius}
      position={f.panel.position}
      from={f.portrait ? [0, -0.6, 0.2] : [0.7, 0, -0.4]}
      paint={(ctx, w, h) => {
        ctx.beginPath()
        ctx.roundRect(1, 1, w - 2, h - 2, px(radius))
        ctx.fillStyle = look.glassThick
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = look.day ? 'rgba(255,255,255,0.95)' : look.line
        ctx.stroke()
      }}
      deps={[radius, f.panel.w, f.panel.h]}
      present={focused}
      onGone={() => setMounted(false)}
    />
  )
}
