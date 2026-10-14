import { messageMeta } from '../../social/homeCard'
import type { MessageCardData } from '../../stores/social'
import { useMetrics } from '../../stores/metrics'
import { ui } from '../../stores/ui'
import { ROLE } from '../brand'
import { ago } from '../format'
import { useNow } from '../tiles/data'
import type { Corner } from '../tiles/Face'
import { CardShell } from './CardShell'
import { urgencyColor } from './kinds'

/**
 * Unread messages on the home grid: who wrote and when, never what (the text
 * stays in People, where only the user opens it). Tapping opens that conversation.
 * Laid out like PriorityCard: mirrored on the right, read upward on the bottom row.
 */
export function MessageCard({
  card,
  corner,
  hidden,
  compact,
}: {
  card: MessageCardData
  corner: Corner
  hidden: boolean
  compact: boolean
}) {
  const tight = useMetrics((m) => m.stack && m.cellH < 118)
  const oneLine = useMetrics((m) => m.stack && m.cellH < 106)
  useNow(30_000) // keeps "3 min ago" current
  const right = corner === 1 || corner === 3
  const bottom = corner === 2 || corner === 3
  const urgency = card.score / 100
  const warmth = Math.round(Math.max(0, urgency - 0.4) * 110)
  const color = ROLE.status.ok
  const glow = `color-mix(in srgb, ${urgencyColor(urgency)} ${warmth}%, ${color})`
  const labelTint = `color-mix(in srgb, ${urgencyColor(urgency)} ${Math.max(35, warmth)}%, var(--t-text))`
  const meta = messageMeta(card, ago(card.at))

  const header = (
    <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
      <span
        className="truncate pl-0.5 font-bold"
        style={{ fontSize: 'clamp(15px, calc(var(--grid) * 0.034), 20px)', color: labelTint }}
      >
        Message
      </span>
    </div>
  )
  const body = (
    <div className={`min-w-0 ${right ? 'text-right' : ''}`}>
      <div
        className={`display text-strong ${oneLine ? 'line-clamp-1' : compact ? 'line-clamp-2' : 'line-clamp-3'}`}
        style={{
          fontSize: compact
            ? 'clamp(17px, calc(var(--grid) * 0.072), 24px)'
            : 'clamp(22px, calc(var(--grid) * 0.096), 52px)',
          lineHeight: 0.98,
          paddingBottom: '0.12em',
          fontWeight: 700,
          letterSpacing: '-0.045em',
        }}
      >
        {card.from}
      </div>
      <div className={`${tight ? 'mt-1' : 'mt-2'} truncate text-[max(12px,calc(var(--grid)*0.025))] font-medium text-muted`}>
        {meta}
      </div>
    </div>
  )

  return (
    <CardShell
      layoutId={`card-dm:${card.threadId}`}
      corner={corner}
      accent={glow}
      hidden={hidden}
      label={`Message from ${card.from}: ${meta}`}
      onOpen={() => ui.openPeople(card.threadId)}
    >
      <div
        className={`relative flex h-full flex-col justify-between ${tight ? 'gap-1 p-[10px]' : 'gap-2 p-[max(12px,calc(var(--grid)*0.035))]'}`}
      >
        {bottom ? (
          <>
            <span />
            {body}
            {header}
          </>
        ) : (
          <>
            {header}
            {body}
            <span />
          </>
        )}
      </div>
    </CardShell>
  )
}
