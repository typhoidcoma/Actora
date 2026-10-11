import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '@actora/stores/agent'
import { plainText } from '@actora/ui/markdownText'
import { TextPanel } from './TextPanel'

/** What she's saying, above her head: the 3D AgentLine (welcome, reply, reminder or message). */
export function AgentLine3D() {
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

  let kicker = a.name
  let text: string
  if (a.fatal) {
    kicker = 'Offline'
    text = `Can't reach ${a.name}. Reload to try again.`
  } else if (a.line === 'notice' && a.notice) {
    kicker = 'Reminder'
    text = [a.notice.title, a.notice.body].filter(Boolean).join('\n')
  } else if (a.line === 'message' && a.message) text = a.message
  else if (a.line === 'reply') {
    if (a.streaming) text = plainText(a.streaming)
    else if (a.phase === 'tool' && a.step?.status === 'running') text = `${a.step.doing}…`
    else if (a.phase === 'thinking') text = '…'
    else text = plainText(a.last ?? '')
  } else text = a.greeting

  if (!text.trim()) return null
  return (
    <TextPanel
      position={[0, 2.12, 0.1]}
      width={2.4}
      height={0.62}
      kicker={kicker}
      body={text}
      bodySize={0.062}
      align="center"
      tone={a.line === 'notice' ? '#ffb454' : undefined}
    />
  )
}
