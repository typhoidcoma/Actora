import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAgent } from '../../stores/agent'
import { useEntities } from '../../stores/entities'
import { useMetrics } from '../../stores/metrics'
import { ui } from '../../stores/ui'
import { clockTime, toolLabel } from '../format'
import { LazyMarkdown } from '../LazyMarkdown'
import { imagesIn, stableMarkdown } from '../markdownText'
import { useNow } from '../tiles/data'
import type { Corner } from '../tiles/Face'
import { CardShell } from './CardShell'

const WENDY_TINT = '#A7C5BD'

/**
 * Box 4: Wendy's latest full answer, live while she streams, with image
 * previews. Before her first reply it carries her welcome and a "today" brief.
 * Tapping opens the reader, where links and images are fully usable.
 */
export function WendyCard({ corner, hidden }: { corner: Corner; hidden: boolean }) {
  const m = useMetrics()
  const a = useAgent(
    useShallow((s) => ({
      last: [...s.messages].reverse().find((x) => x.role === 'assistant'),
      streaming: s.streaming,
      busy: s.awaitingTurn || s.turnId !== null,
      phase: s.phase,
      tool: s.toolName,
      greeting: s.greeting.text,
      botName: s.botName,
    })),
  )
  const live = a.busy ? (a.streaming ?? '') : null
  const text = live !== null ? stableMarkdown(live) : (a.last?.text ?? '')
  const images = useMemo(() => imagesIn(text), [text])
  const status = a.busy
    ? a.phase === 'tool'
      ? `${toolLabel(a.tool) || 'Working'}…`
      : live
        ? 'Writing…'
        : 'Thinking…'
    : a.last
      ? 'Latest answer'
      : 'Today'
  // Wrap text around the orb's notch in the top-left corner: a float whose
  // shape-outside is the notch circle, positioned back at the card's corner.
  const pad = Math.max(12, m.grid * 0.035)
  const headerH = 28
  const notchR = m.orb / 2 + m.gap + 8
  const centre = -m.gap / 2 // notch centre sits half a gap outside the card corner

  return (
    <CardShell
      layoutId="wendy-card"
      corner={corner}
      accent={WENDY_TINT}
      hidden={hidden}
      label={`${a.botName}'s answer — open to read`}
      onOpen={ui.openReader}
    >
      <div className="relative flex h-full flex-col p-[max(12px,calc(var(--grid)*0.035))]">
        <div className="mb-1 flex items-center justify-end gap-2">
          <span className={`label ${a.busy ? 'shimmer rounded-full px-2' : ''}`}>{status}</span>
          <span className="h-2 w-2 rounded-full" style={{ background: WENDY_TINT }} />
          <span className="display text-[15px] text-strong">{a.botName}</span>
        </div>

        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, #000 70%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 70%, transparent)',
          }}
        >
          <span
            aria-hidden
            className="float-left"
            style={{
              width: Math.max(0, notchR + centre - pad),
              height: Math.max(0, notchR + centre - pad - headerH),
              shapeOutside: `circle(${notchR}px at ${centre - pad}px ${centre - pad - headerH}px)`,
            }}
          />
          {text ? (
            <div className="card-md pointer-events-none text-[max(13px,calc(var(--grid)*0.026))] text-text">
              <LazyMarkdown text={text} />
            </div>
          ) : (
            <TodayBrief greeting={a.greeting} />
          )}
        </div>

        {images.length > 0 && (
          <div className="mt-2 flex justify-end gap-1.5">
            {images.map((img) => (
              <img
                key={img.src}
                src={img.src}
                alt={img.alt}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => (e.currentTarget.style.display = 'none')}
                className="h-[calc(var(--grid)*0.09)] w-[calc(var(--grid)*0.13)] rounded-md object-cover"
              />
            ))}
          </div>
        )}
      </div>
    </CardShell>
  )
}

function TodayBrief({ greeting }: { greeting: string }) {
  const { tasks, events, notifications } = useEntities(
    useShallow((s) => ({ tasks: s.tasks, events: s.events, notifications: s.notifications })),
  )
  const now = useNow(60_000)
  const open = Object.values(tasks).filter((t) => t.status !== 'done' && t.status !== 'skipped').length
  const next = Object.values(events)
    .filter((e) => Date.parse(e.start_time) > now)
    .sort((x, y) => Date.parse(x.start_time) - Date.parse(y.start_time))[0]
  const unread = Object.values(notifications).filter((n) => !n.read_at).length
  return (
    <div className="text-[max(13px,calc(var(--grid)*0.026))] text-text">
      {greeting && <p className="mb-2">{greeting}</p>}
      <p className="text-muted">
        {open} open task{open === 1 ? '' : 's'}
        {next ? ` · next: ${next.title} ${clockTime(next.start_time)}` : ''}
        {unread ? ` · ${unread} unread` : ''}
      </p>
    </div>
  )
}
