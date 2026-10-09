import { AnimatePresence, motion } from 'motion/react'
import { completeTask } from '../../aelora/client'
import type { Task } from '../../aelora/protocol'
import { AnimatedNumber } from '../AnimatedNumber'
import { dueLabel } from '../format'
import { morph, press } from '../motion'
import { useTasks } from './data'
import { DashRun, Face, type Corner } from './Face'
import { Empty, Section } from './parts'

export const TASKS_ACCENT = '#CDE04A'

export function TasksFace({ corner }: { corner: Corner }) {
  const { open, todayTotal, todayDone } = useTasks()
  return (
    <Face
      corner={corner}
      accent={TASKS_ACCENT}
      label="Tasks"
      value={<AnimatedNumber value={open.length} />}
      unit="open"
      line={open[0]?.title ?? 'All clear'}
      motif={todayTotal > 0 && <DashRun total={todayTotal} lit={todayDone} accent={TASKS_ACCENT} />}
    />
  )
}

export function TasksDetail() {
  const { open, done, hydrated } = useTasks()
  if (hydrated && !open.length && !done.length) return <Empty text="No tasks yet. Ask Wendy to add one." />
  return (
    <>
      <Section title="Open" count={open.length}>
        <AnimatePresence initial={false}>
          {open.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </AnimatePresence>
      </Section>
      {done.length > 0 && (
        <Section title="Done" count={done.length}>
          {done.slice(0, 12).map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Section>
      )}
    </>
  )
}

function TaskRow({ task }: { task: Task }) {
  const isDone = task.status === 'done'
  const due = dueLabel(task.due_date)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDone ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={morph}
      className="flex items-center gap-3 border-b border-line py-1.5 last:border-0"
    >
      <motion.button
        whileTap={press}
        aria-label={isDone ? 'Completed' : `Complete ${task.title}`}
        disabled={isDone}
        onClick={() => void completeTask(task.id)}
        className="grid h-11 w-11 shrink-0 place-items-center"
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full border transition-all duration-300"
          style={{
            borderColor: isDone ? TASKS_ACCENT : 'rgb(255 255 255 / 0.25)',
            background: isDone ? TASKS_ACCENT : 'transparent',
          }}
        >
          {isDone && (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <motion.path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="#07080b"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </svg>
          )}
        </span>
      </motion.button>
      <span className={`min-w-0 flex-1 truncate text-[15px] ${isDone ? 'line-through decoration-white/30' : ''}`}>
        {task.title}
      </span>
      {due && !isDone && (
        <span className={`num shrink-0 text-xs ${due === 'Overdue' ? 'text-coral' : 'text-muted'}`}>{due}</span>
      )}
      {task.estimated_minutes && !isDone ? (
        <span className="num shrink-0 text-xs text-faint">{task.estimated_minutes}m</span>
      ) : null}
    </motion.li>
  )
}
