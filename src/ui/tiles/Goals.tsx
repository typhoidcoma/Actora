import { motion } from 'motion/react'
import { AnimatedNumber } from '../AnimatedNumber'
import { morph } from '../motion'
import { useGoals } from './data'
import { Bar, Face, type Corner } from './Face'
import { Empty, Section } from './parts'

export const GOALS_ACCENT = '#FF5566'

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
  if (hydrated && !active.length) return <Empty text="No active goals. Tell Wendy what you're working toward." />
  return (
    <Section title="Active" count={active.length}>
      {active.map(({ goal, done, total, progress }, i) => (
        <motion.li
          key={goal.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...morph, delay: 0.04 * i }}
          className="border-b border-line py-3.5 last:border-0"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] text-white">{goal.title}</span>
            <span className="num shrink-0 text-xs text-muted">
              {goal.timeframe ? `${goal.timeframe} · ` : ''}
              {done}/{total}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full"
              style={{ background: GOALS_ACCENT, boxShadow: `0 0 14px ${GOALS_ACCENT}` }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, progress * 100)}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.1 + 0.04 * i }}
            />
          </div>
          {goal.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{goal.description}</p>}
        </motion.li>
      ))}
    </Section>
  )
}
