import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../../stores/agent'
import { ui } from '../../stores/ui'
import { toolLabel } from '../format'
import { LazyMarkdown } from '../LazyMarkdown'
import { stableMarkdown } from '../markdownText'
import { Panel } from './Panel'

/**
 * Box 4 expanded: Wendy's full answer with everything usable — links open,
 * images at full size, tables, code. Follow-ups are on the rail.
 */
export function Reader() {
  const a = useAgent(
    useShallow((s) => {
      const lastIdx = s.messages.map((m) => m.role).lastIndexOf('assistant')
      const asked = [...s.messages.slice(0, lastIdx < 0 ? undefined : lastIdx)].reverse().find((m) => m.role === 'user')
      return {
        answer: lastIdx >= 0 ? s.messages[lastIdx].text : '',
        asked: asked?.text ?? null,
        streaming: s.streaming,
        busy: s.awaitingTurn || s.turnId !== null,
        phase: s.phase,
        tool: s.toolName,
        botName: s.botName,
      }
    }),
  )
  const text = a.busy && a.streaming !== null ? stableMarkdown(a.streaming) : a.answer
  const kicker = a.busy ? (a.phase === 'tool' ? `${toolLabel(a.tool)}…` : 'Writing…') : a.botName

  return (
    <Panel
      layoutId="wendy-card"
      accent="#A7C5BD"
      kicker={kicker}
      title={a.asked ? `“${a.asked}”` : 'Your answer'}
      onClose={ui.closeReader}
    >
      {text ? (
        <div className="text-[16px] text-text">
          <LazyMarkdown text={text} />
        </div>
      ) : (
        <p className="text-muted">Nothing yet — tap an option below and Wendy's full answer lands here.</p>
      )}
    </Panel>
  )
}
