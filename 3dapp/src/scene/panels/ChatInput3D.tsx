import { useAgent } from '@actora/stores/agent'
import { CHIP_H, useStage } from '../../look/layout'
import { font, px } from '../../look/paint'
import { useLook } from '../../look/theme'
import { focusDraft, useDraft } from '../draft'
import { Pane } from './Pane'

/** The message box, in the scene: tap to type, Enter to send (the keys go to the hidden input). */
export function ChatInput3D() {
  const look = useLook()
  const stage = useStage()
  const { text, focused } = useDraft()
  const name = useAgent((s) => s.botName)
  return (
    <Pane
      width={stage.input.w}
      height={CHIP_H}
      radius={CHIP_H / 2}
      position={[0, stage.input.y, stage.input.z]}
      rotation={[-0.14, 0, 0]}
      paint={(ctx, w, h) => {
        ctx.beginPath()
        ctx.roundRect(1, 1, w - 2, h - 2, h / 2)
        ctx.fillStyle = look.glassThick
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = focused ? look.role.accent : look.day ? 'rgba(255,255,255,0.95)' : look.line
        ctx.stroke()
        const x = px(0.06)
        ctx.font = font(500, 0.044)
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.fillStyle = text ? look.strong : look.muted
        const shown = text || (focused ? '' : `Say something to ${name}`)
        // Long drafts scroll: keep the end (where you're typing) in view.
        let s = shown
        while (s.length > 1 && ctx.measureText(s).width > w - x * 2 - 8) s = s.slice(1)
        ctx.fillText(s, x, h / 2 + 1)
        if (focused) {
          ctx.fillStyle = look.role.accent
          ctx.fillRect(x + (text ? ctx.measureText(s).width : 0) + 3, h * 0.26, 3, h * 0.48)
        }
      }}
      deps={[text, focused, name]}
      delay={0.4}
      onPress={focusDraft}
    />
  )
}
