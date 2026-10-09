import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../../stores/agent'
import { ui } from '../../stores/ui'
import { Activity } from '../Activity'
import { LazyMarkdown } from '../LazyMarkdown'
import { stableMarkdown } from '../markdownText'
import { Panel } from './Panel'
import { ROLE } from '../brand'

/**
 * Box 4 expanded: Wendy's full answer with everything usable — links open,
 * images at full size, tables, code. Follow-ups are on the rail.
 */
export function Reader() {
  const a = useAgent(
    useShallow((s) => {
      const busy = s.awaitingTurn || s.turnId !== null
      const lastIdx = s.messages.map((m) => m.role).lastIndexOf('assistant')
      // Mid-turn the question is the newest message; otherwise the one before the answer.
      const before = busy ? s.messages : s.messages.slice(0, lastIdx < 0 ? undefined : lastIdx)
      const asked = [...before].reverse().find((m) => m.role === 'user')
      return {
        answer: lastIdx >= 0 ? s.messages[lastIdx].text : '',
        asked: asked?.text ?? null,
        streaming: s.streaming,
        busy: s.awaitingTurn || s.turnId !== null,
        phase: s.phase,
        tool: s.toolName,
        doing: s.steps.findLast((x) => x.status === 'running')?.doing ?? null,
        botName: s.botName,
      }
    }),
  )
  const text = a.busy && a.streaming !== null ? stableMarkdown(a.streaming) : a.answer
  const kicker = a.busy ? (a.phase === 'tool' ? 'Working…' : a.streaming ? 'Writing…' : 'Thinking…') : 'Latest answer'

  return (
    <Panel lead layoutId="reader" accent={ROLE.wendy} kicker={kicker} title={a.botName} onClose={ui.closeReader}>
      {a.asked && (
        <p className="mb-4 border-l-2 border-line pl-3 text-[15px] text-muted">
          You asked <span className="text-text">“{a.asked}”</span>
        </p>
      )}
      {text ? (
        <div className="text-[16px] text-text">
          <LazyMarkdown text={text} />
        </div>
      ) : a.busy ? (
        <div className="display grid min-h-[40%] place-items-center py-10 text-center text-[24px] text-strong">
          <Activity />
        </div>
      ) : (
        <p className="text-muted">Nothing yet — tap an option below and Wendy's full answer lands here.</p>
      )}
    </Panel>
  )
}
