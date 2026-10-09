import { kindOf, usePendingAction, type PendingAction } from '../../stores/pending'
import { ui } from '../../stores/ui'
import type { Corner } from '../tiles/Face'
import { ROLE } from '../brand'
import { CardShell } from './CardShell'

/**
 * Box 4 while something waits for the user's OK: what it is and Wendy's
 * summary (recipients, subject, the opening line). The answers are the pills
 * on the rail (Send / Change it / Discard); tapping the card opens the chat to
 * talk it over.
 */
export function PendingCard({ corner, hidden }: { corner: Corner; hidden: boolean }) {
  const p = usePendingAction()
  if (!p) return null
  const k = kindOf(p.kind)
  return (
    <CardShell
      layoutId="pending-card"
      corner={corner}
      accent={ROLE.urgent}
      hidden={hidden}
      label={`${k.label}, waiting for your OK: ${p.summary}`}
      onOpen={ui.openChat}
    >
      <PendingBody p={p} corner={corner} />
    </CardShell>
  )
}

export function PendingBody({
  p,
  compact = false,
  corner = 0,
}: {
  p: PendingAction
  compact?: boolean
  corner?: Corner
}) {
  const k = kindOf(p.kind)
  // Like the other cards: read away from the orb's notch (bottom row anchors low, right column aligns right).
  const right = corner === 1 || corner === 3
  const bottom = corner === 2 || corner === 3
  return (
    <div
      className={`flex h-full flex-col gap-1.5 ${bottom ? 'justify-end' : ''} ${right ? 'items-end text-right' : ''} ${compact ? '' : 'p-[max(12px,calc(var(--grid)*0.035))]'}`}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: ROLE.urgent }}>
        <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: ROLE.urgent }} aria-hidden />
        {p.status === 'retryable' ? 'Google hiccup · tap Try again' : 'Waiting for your OK'}
      </div>
      <div className="display text-[clamp(17px,calc(var(--grid)*0.05),26px)] leading-tight font-bold text-strong">
        {k.label}
      </div>
      <p className={`selectable text-[14px] leading-snug text-text ${compact ? 'line-clamp-3' : 'line-clamp-4'}`}>
        {p.summary || 'Wendy has it ready.'}
      </p>
    </div>
  )
}
