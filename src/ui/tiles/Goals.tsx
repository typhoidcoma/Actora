import { motion } from 'motion/react'
import type { GoalRow } from './data'
import { ui } from '../../stores/ui'
import { AnimatedNumber } from '../AnimatedNumber'
import { morph } from '../motion'
import { useGoals, useSelected } from './data'
import { Bar, Face, type Corner } from './Face'
import { Empty, Section, SelectedWash } from './parts'
import { ROLE } from '../brand'

export const GOALS_ACCENT = ROLE.kind.goal

export function GoalsFace({ corner }: { corner: Corner }) {
  const { active, overall } = useGoals()
  return (
    <Face
      corner={corner}
      accent={GOALS_ACCENT}
      label="Goals"
      value={<AnimatedNumber value={Math.round(overall * 100)} />}
      unit="%"
      line={active.length ? `${active.length} active · ${active[0].goal.title}` : 'No active goals'}
      motif={active.length > 0 && <Bar value={overall} accent={GOALS_ACCENT} />}
    />
  )
}

export function GoalsDetail() {
  const { active, hydrated } = useGoals()
  if (hydrated && !active.length) return <Empty text="No goals yet." />
  return (
    <Section title="Active" count={active.length}>
      {active.map((row, i) => (
        <GoalItem key={row.goal.id} row={row} index={i} />
      ))}
    </Section>
  )
}

function GoalItem({ row: { goal, done, total, progress }, index }: { row: GoalRow; index: number }) {
  const selected = useSelected('goal', goal.id)
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...morph, delay: 0.04 * index }}
      className="relative isolate border-b border-line last:border-0"
    >
      <SelectedWash on={selected} accent={GOALS_ACCENT} />
      <button onClick={() => ui.select({ kind: 'goal', id: goal.id })} className="block w-full py-3.5 text-left">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="truncate text-[16px] text-strong">{goal.title}</span>
          <span className="num shrink-0 text-xs text-muted">
            {goal.timeframe ? `${goal.timeframe} · ` : ''}
            {done}/{total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-text/10">
          <motion.div
            className="h-full rounded-full"
            style={{ background: GOALS_ACCENT }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(2, progress * 100)}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.1 + 0.04 * index }}
          />
        </div>
        {goal.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{goal.description}</p>}
      </button>
    </motion.li>
  )
}
