import { AnimatePresence, motion } from 'motion/react'
import { completeTask } from '../../aelora/client'
import type { Task } from '../../aelora/protocol'
import { ui } from '../../stores/ui'
import { AnimatedNumber } from '../AnimatedNumber'
import { dueLabel } from '../format'
import { morph, press } from '../motion'
import { useTasks, useSelected } from './data'
import { DashRun, Face, type Corner } from './Face'
import { Empty, Section, SelectedWash } from './parts'

export const TASKS_ACCENT = '#EB7B59'

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
  if (hydrated && !open.length && !done.length) return <Empty text="Nothing on your list." />
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
  const selected = useSelected('task', task.id)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={morph}
      className="relative isolate flex items-center gap-3 border-b border-line py-1.5 last:border-0"
    >
      <SelectedWash on={selected} accent={TASKS_ACCENT} />
      <motion.button
        whileTap={press}
        aria-label={isDone ? 'Completed' : `Complete ${task.title}`}
        disabled={isDone}
        onClick={() => void completeTask(task.id)}
        className="grid h-11 w-11 shrink-0 place-items-center"
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full border-[1.5px] transition-all duration-300"
          style={{
            borderColor: isDone ? TASKS_ACCENT : 'var(--t-faint)',
            background: isDone ? TASKS_ACCENT : 'transparent',
          }}
        >
          {isDone && (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <motion.path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="#2A2230"
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
      <button
        onClick={() => ui.select({ kind: 'task', id: task.id })}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`min-w-0 flex-1 truncate text-[16px] text-strong ${isDone ? 'line-through decoration-faint' : ''}`}
        >
          {task.title}
        </span>
        {due && !isDone && (
          <span className={`num shrink-0 text-xs ${due === 'Overdue' ? 'text-urgent' : 'text-muted'}`}>{due}</span>
        )}
        {task.estimated_minutes && !isDone ? (
          <span className="num shrink-0 text-xs text-faint">{task.estimated_minutes}m</span>
        ) : null}
      </button>
    </motion.li>
  )
}
