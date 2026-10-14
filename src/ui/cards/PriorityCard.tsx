import { motion, useReducedMotion } from 'motion/react'
import { ringing } from '../../aelora/protocol'
import { useEntities } from '../../stores/entities'
import { useNow } from '../tiles/data'
import { runOption } from '../../options/run'
import { actOption } from '../../options/types'
import type { RankedItem } from '../../stores/priority'
import { useMetrics } from '../../stores/metrics'
import { ui } from '../../stores/ui'
import { press } from '../motion'
import type { Corner } from '../tiles/Face'
import { CardShell } from './CardShell'
import { KIND, urgencyColor } from './kinds'

/**
 * One thing to tackle: its kind up top, the title big, a factual meta line.
 * (No "why now" text: it only restated the title; the agent's ranking is the order.) Mirrored for
 * the right-hand column; bottom-row cards read upward so nothing sits under the
 * orb's notch.
 */
export function PriorityCard({
  item,
  rank,
  corner,
  hidden,
  compact,
}: {
  item: RankedItem
  rank: number
  corner: Corner
  hidden: boolean
  compact: boolean
}) {
  const kind = KIND[item.kind]
  // Short phones: cards squeeze to fit all four, so trim the padding and spacing.
  const tight = useMetrics((m) => m.stack && m.cellH < 118)
  // The shortest cards keep the title to one line so the meta line still fits.
  const oneLine = useMetrics((m) => m.stack && m.cellH < 106)
  const right = corner === 1 || corner === 3
  const bottom = corner === 2 || corner === 3
  const heat = urgencyColor(item.urgency)
  // Urgency lives in the card, not on a sticker: the glow warms from the kind's
  // colour toward red as it gets pressing, and the kind label takes a soft tint.
  // No rank numbers: the order of the cards already says what comes first.
  const warmth = Math.round(Math.max(0, item.urgency - 0.4) * 110)
  const glow = `color-mix(in srgb, ${heat} ${warmth}%, ${kind.color})`
  const labelTint = `color-mix(in srgb, ${heat} ${Math.max(35, warmth)}%, var(--t-text))`
  // A reminder going off right now rings: the card glows and pulses like an alarm
  // until it's acknowledged (Got it, opened) or a quarter of an hour passes.
  const reminder = useEntities((s) => (item.kind === 'notification' ? s.notifications[item.id] : undefined))
  const now = useNow(15_000)
  const ring = !!reminder && ringing(reminder, now)
  // A message a friend left with your assistant arrives as a notification: say what it is.
  const kindLabel = reminder?.origin_type === 'assistant' ? 'Message for you' : kind.label
  const still = useReducedMotion()
  const alarm = 'var(--color-urgent)'

  const header = (
    <div className={`flex items-center justify-between gap-2 ${right ? 'flex-row-reverse' : ''}`}>
      <span
        className={`flex min-w-0 items-center gap-1.5 overflow-visible pl-0.5 font-bold ${right ? 'flex-row-reverse' : ''}`}
        style={{ fontSize: 'clamp(15px, calc(var(--grid) * 0.034), 20px)', color: ring ? alarm : labelTint }}
      >
        {ring && (
          <motion.span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: alarm }}
            animate={still ? undefined : { scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className="truncate">{ring ? `${kindLabel} · now` : kindLabel}</span>
      </span>
      {/* Tasks finish from their panel or by voice; a lone checkbox looked out of place here. */}
      {item.primary && item.primary.act.type !== 'complete' && (
        <motion.button
          whileTap={press}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            runOption(actOption(item.primary!.label, item.primary!.act))
          }}
          aria-label={`${item.primary.label}: ${item.title}`}
          className={`glass-pill grid shrink-0 ${tight ? 'h-8 min-w-8' : 'h-9 min-w-9'} place-items-center rounded-[6px] px-2.5 text-[12px] font-semibold text-strong`}
        >
          {item.primary.label}
        </motion.button>
      )}
    </div>
  )

  // Heroic title: the thing itself, big and tight, like the old hero numbers.
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
        {item.title}
      </div>
      <div
        className={`${tight ? 'mt-1' : 'mt-2'} truncate text-[max(12px,calc(var(--grid)*0.025))] font-medium text-muted`}
      >
        {item.meta}
      </div>
    </div>
  )

  return (
    <CardShell
      layoutId={`card-${item.key}`}
      corner={corner}
      accent={glow}
      hidden={hidden}
      // Screen readers still hear the order, which the layout shows visually.
      label={`${rank === 1 ? 'Top priority' : `Priority ${rank}`}, ${kindLabel}${ring ? ' going off now' : ''}: ${item.title}`}
      onOpen={() => ui.open({ kind: item.kind, id: item.id, occurrence: item.occurrence })}
    >
      {ring && (
        // The alarm glow: a warm ring round the inside edge, breathing in and out.
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{ borderRadius: 'inherit' }}
          initial={{ opacity: 0 }}
          animate={
            still
              ? { opacity: 1, boxShadow: `inset 0 0 0 2px ${alarm}, inset 0 0 26px -6px ${alarm}` }
              : {
                  opacity: [0.55, 1, 0.55],
                  boxShadow: [
                    `inset 0 0 0 1.5px ${alarm}, inset 0 0 14px -8px ${alarm}`,
                    `inset 0 0 0 2.5px ${alarm}, inset 0 0 38px -4px ${alarm}`,
                    `inset 0 0 0 1.5px ${alarm}, inset 0 0 14px -8px ${alarm}`,
                  ],
                }
          }
          transition={still ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        className={`relative flex h-full flex-col justify-between ${tight ? 'gap-1 p-[10px]' : 'gap-2 p-[max(12px,calc(var(--grid)*0.035))]'}`}
      >
        {bottom ? (
          <>
            {/* spacer: keeps the title centred, clear of the notch */}
            <span />
            {body}
            {header}
          </>
        ) : (
          <>
            {header}
            {body}
            {/* spacer: keeps the title centred, clear of the notch */}
            <span />
          </>
        )}
      </div>
    </CardShell>
  )
}
