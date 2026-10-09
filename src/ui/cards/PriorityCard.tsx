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
  const rankLabel = rank === 1 && item.urgency >= 0.9 ? 'Now' : `#${rank}`

  const header = (
    <div className={`flex items-center justify-between gap-2 ${right ? 'flex-row-reverse' : ''}`}>
      <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        <span
          className="num rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-on-accent"
          style={{ background: heat }}
        >
          {rankLabel}
        </span>
        <span className="label truncate">{kind.label}</span>
      </div>
      {item.primary && (
        <motion.button
          whileTap={press}
          onClick={(e) => {
            e.stopPropagation()
            runOption(actOption(item.primary!.label, item.primary!.act))
          }}
          aria-label={`${item.primary.label}: ${item.title}`}
          className="glass-pill grid h-9 min-w-9 shrink-0 place-items-center rounded-[10px] px-2.5 text-[12px] font-semibold text-strong"
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

  // Why it matters now: a small tinted callout in the card's colour, signed by
  // Wendy (orb dot) when it is her reasoning rather than the local default.
  const why = !compact && (
    <div
      className={`flex max-w-[74%] items-start gap-2.5 rounded-[10px] px-3 py-2 ${right ? 'ml-auto flex-row-reverse text-right' : ''}`}
      style={{
        background: `color-mix(in srgb, ${kind.color} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${kind.color} 22%, transparent)`,
      }}
    >
      {item.whyFrom === 'wendy' ? (
        <span
          aria-hidden
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 30%, #F4EEE2, #EB7B59 45%, #A7C5BD 80%)' }}
        />
      ) : (
        <span aria-hidden className="mt-1 h-2.5 w-[3px] shrink-0 rounded-full" style={{ background: kind.color }} />
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-bold" style={{ color: kind.color }}>
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
      accent={kind.color}
      hidden={hidden}
      label={`${rankLabel}: ${item.title}`}
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
