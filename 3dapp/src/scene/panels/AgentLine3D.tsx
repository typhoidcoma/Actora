import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ringing } from '@actora/aelora/protocol'
import { useAgent } from '@actora/stores/agent'
import { useEntities } from '@actora/stores/entities'
import { useNow } from '@actora/ui/tiles/data'
import { plainText } from '@actora/ui/markdownText'
import { useFocused } from '../../look/focus'
import { useStage } from '../../look/layout'
import { drawLines, font, px, wrap } from '../../look/paint'
import { useLook } from '../../look/theme'
import { Pane } from './Pane'

const LH = 1.3

/** Her first sentence, as the 2D line carries it (the full answer lives in the chat). */
function firstSentence(text: string): string {
  const m = /^[\s\S]*?[.!?…](?=\s|$)/.exec(text)
  return (m ? m[0] : text).trim()
}

/** Her voice above the grid: bare text, no glass, like the 2D AgentLine. */
export function AgentLine3D() {
  const look = useLook()
  const stage = useStage()
  const focused = useFocused()
  const SIZE = stage.line.size
  const a = useAgent(
    useShallow((s) => ({
      name: s.botName,
      fatal: s.connection === 'fatal',
      line: s.line,
      notice: s.notice,
      message: s.message,
      streaming: s.streaming,
      phase: s.phase,
      step: s.steps[s.steps.length - 1],
      last: s.messages.findLast((m) => m.role === 'assistant')?.text ?? null,
      greeting: s.greeting.text,
      busy: s.awaitingTurn || s.turnId !== null,
    })),
  )
  const reminder = useEntities((s) => (a.notice ? s.notifications[a.notice.notificationId] : undefined))
  const now = useNow(15_000)
  const ring = a.line === 'notice' && !!reminder && ringing(reminder, now)

  let text: string
  let color = look.strong
  if (a.fatal) {
    text = `Can't reach ${a.name}. Reload to try again.`
    color = look.ink.urgent
  } else if (a.line === 'notice' && a.notice) {
    text = a.notice.body ? `${a.notice.title}: ${a.notice.body}` : a.notice.title
    if (ring) color = look.ink.urgent
  } else if (a.line === 'message' && a.message) text = a.message
  else if (a.line === 'reply') {
    if (a.streaming) text = firstSentence(plainText(a.streaming))
    // Working on it: the animated Activity (Overlay) shows over her head instead.
    else if (a.busy) text = ''
    else text = firstSentence(plainText(a.last ?? ''))
  } else text = a.greeting

  // Keep the last words while the line eases out.
  const shown = useRef({ text, color })
  const present = !!text.trim()
  if (present) shown.current = { text, color }

  const f = font(500, SIZE)
  const spacing = `${-px(SIZE * 0.015)}px`
  const lines = wrap(shown.current.text, f, px(stage.line.w), 3, spacing)
  const height = lines.length * SIZE * LH + 0.04

  return (
    <Pane
      bare
      width={stage.line.w}
      height={height}
      // Down: the first line sits at the anchor and later ones run below it.
      // Up (a caption over her head): the last line sits at the anchor and it grows upward.
      position={[
        stage.line.position[0],
        stage.line.position[1] + (stage.line.grow === 'up' ? height / 2 : -(height / 2 - SIZE * LH * 0.5)) * stage.line.scale,
        stage.line.position[2],
      ]}
      rotation={stage.line.rotation}
      size={stage.line.scale}
      paint={(ctx, w) => drawLines(ctx, lines, w / 2, px(0.02), px(SIZE * LH), f, shown.current.color, 'center', spacing)}
      deps={[lines.join('\n'), shown.current.color]}
      present={present && !focused}
    />
  )
}
