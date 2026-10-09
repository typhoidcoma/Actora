import { inkOf } from '../brand'
import { motion } from 'motion/react'
import { runOption } from '../../options/run'
import { actOption } from '../../options/types'
import type { RankedItem } from '../../stores/priority'
import { ui } from '../../stores/ui'
import { press } from '../motion'
import type { Corner } from '../tiles/Face'
import { CardShell } from './CardShell'
import { KIND, urgencyColor } from './kinds'

/**
 * One thing to tackle. Rank and kind up top, the title big, a factual meta line,
 * and why it matters now (Wendy's words when she has ranked it). Mirrored for
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
  const right = corner === 1 || corner === 3
  const bottom = corner === 2 || corner === 3
  const heat = urgencyColor(item.urgency)
  // Urgency lives in the card, not on a sticker: the glow warms from the kind's
  // colour toward red as it gets pressing, and the kind label takes a soft tint.
  // No rank numbers: the order of the cards already says what comes first.
  const warmth = Math.round(Math.max(0, item.urgency - 0.4) * 110)
  const glow = `color-mix(in srgb, ${heat} ${warmth}%, ${kind.color})`
  const labelTint = `color-mix(in srgb, ${heat} ${Math.max(35, warmth)}%, var(--t-text))`

  const header = (
    <div className={`flex items-center justify-between gap-2 ${right ? 'flex-row-reverse' : ''}`}>
      <span
        className="truncate font-bold"
        style={{ fontSize: 'clamp(15px, calc(var(--grid) * 0.034), 20px)', color: labelTint }}
      >
        {kind.label}
      </span>
      {item.primary && (
        <motion.button
          whileTap={press}
          onClick={(e) => {
            e.stopPropagation()
            runOption(actOption(item.primary!.label, item.primary!.act))
          }}
          aria-label={`${item.primary.label}: ${item.title}`}
          className="glass-pill grid h-9 min-w-9 shrink-0 place-items-center rounded-[6px] px-2.5 text-[12px] font-semibold text-strong"
        >
          {item.primary.act.type === 'complete' ? <Check /> : item.primary.label}
        </motion.button>
      )}
    </div>
  )

  // Heroic title: the thing itself, big and tight, like the old hero numbers.
  const body = (
    <div className={`min-w-0 ${right ? 'text-right' : ''}`}>
      <div
        className={`display text-strong ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}
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
      <div className="mt-2 truncate text-[max(12px,calc(var(--grid)*0.025))] font-medium text-muted">{item.meta}</div>
    </div>
  )

  // Why it matters now: a tinted band right across the card (edge to edge, past
  // the padding), fading away from the text side, signed "Wendy says" when it's
  // her reasoning rather than the local default.
  const why = !compact && (
    <div
      className={`-mx-[max(12px,calc(var(--grid)*0.035))] flex px-[max(12px,calc(var(--grid)*0.035))] py-2.5 ${right ? 'justify-end text-right' : ''}`}
      style={{
        background: `linear-gradient(${right ? 270 : 90}deg, color-mix(in srgb, ${kind.color} 18%, transparent), color-mix(in srgb, ${kind.color} 5%, transparent))`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, ${kind.color} 24%, transparent), inset 0 -1px 0 color-mix(in srgb, ${kind.color} 14%, transparent)`,
      }}
    >
      {/* Text stays clear of the orb's notch on the inner side. */}
      <div className="min-w-0 max-w-[78%]">
        <div className="text-[13px] font-bold" style={{ color: inkOf(kind.color) }}>
          {item.whyFrom === 'wendy' ? 'Wendy says' : 'Why now'}
        </div>
        <div className="line-clamp-2 text-[max(13px,calc(var(--grid)*0.024))] leading-snug font-medium text-strong">
          {item.why}
        </div>
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
      label={`${rank === 1 ? 'Top priority' : `Priority ${rank}`}, ${kind.label}: ${item.title}`}
      onOpen={() => ui.open({ kind: item.kind, id: item.id })}
    >
      <div className="flex h-full flex-col justify-between gap-2 p-[max(12px,calc(var(--grid)*0.035))]">
        {bottom ? (
          <>
            {why || <span />}
            {body}
            {header}
          </>
        ) : (
          <>
            {header}
            {body}
            {why || <span />}
          </>
        )}
      </div>
    </CardShell>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
