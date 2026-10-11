import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ringing } from '@actora/aelora/protocol'
import { useAgent } from '@actora/stores/agent'
import { useEntities } from '@actora/stores/entities'
import { useNow } from '@actora/ui/tiles/data'
import { plainText } from '@actora/ui/markdownText'
import { useLook } from '../../look/theme'
import { Glass } from './Glass'

/** What she's saying, above her head: the 3D AgentLine (welcome, reply, reminder or message). */
export function AgentLine3D() {
  const look = useLook()
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
    })),
  )
  const reminder = useEntities((s) => (a.notice ? s.notifications[a.notice.notificationId] : undefined))
  const now = useNow(15_000)
  const ring = a.line === 'notice' && !!reminder && ringing(reminder, now)

  let kicker = a.name
  let text: string
  let tone: string | undefined = look.ink.agent
  if (a.fatal) {
    kicker = 'Offline'
    text = `Can't reach ${a.name}. Reload to try again.`
    tone = look.ink.urgent
  } else if (a.line === 'notice' && a.notice) {
    kicker = ring ? 'Reminder · now' : 'Reminder'
    tone = ring ? look.ink.urgent : look.ink.reminder
    text = [a.notice.title, a.notice.body].filter(Boolean).join('\n')
  } else if (a.line === 'message' && a.message) text = a.message
  else if (a.line === 'reply') {
    if (a.streaming) text = plainText(a.streaming)
    else if (a.phase === 'tool' && a.step?.status === 'running') text = `${a.step.doing}…`
    else if (a.phase === 'thinking') text = '…'
    else text = plainText(a.last ?? '')
  } else text = a.greeting

  // Keep the last words on the glass while it eases out.
  const shown = useRef({ kicker, text, tone })
  const present = !!text.trim()
  if (present) shown.current = { kicker, text, tone }

  return (
    <Glass
      position={[0, 2.18, 0.1]}
      width={2.5}
      maxHeight={0.9}
      kicker={shown.current.kicker}
      kickerColor={shown.current.tone}
      body={shown.current.text}
      bodySize={0.07}
      align="center"
      glow={ring ? look.role.urgent : null}
      present={present}
    />
  )
}
