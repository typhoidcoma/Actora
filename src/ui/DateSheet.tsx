import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { rescheduleTask } from '../aelora/client'
import { useEntities } from '../stores/entities'
import { useMetrics } from '../stores/metrics'
import { ui, useUi } from '../stores/ui'
import { morph, press } from './motion'
import { validDay } from './format'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "Pick a day…": the next week as big tap targets, plus any date. */
export function DateSheet() {
  const taskId = useUi((s) => s.picking)
  return <AnimatePresence>{taskId && <Sheet key="date" taskId={taskId} />}</AnimatePresence>
}

function Sheet({ taskId }: { taskId: string }) {
  const m = useMetrics()
  const task = useEntities((s) => s.tasks[taskId])
  const w = Math.min(m.vw - 24, 520)
  // Fixed when the sheet opens (the list of days shouldn't shift under a finger).
  const [now] = useState(() => new Date())
  const days = Array.from({ length: 8 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i))
  const [other, setOther] = useState('')
  const pickIfValid = (d: string) => {
    if (validDay(d, iso(now))) pick(d)
  }
  const pick = (d: string) => {
    ui.pickDay(null)
    ui.select(null)
    void rescheduleTask(taskId, d)
  }
  const label = (d: Date, i: number) =>
    i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => ui.pickDay(null)}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Pick a day for ${task?.title ?? 'this task'}`}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={morph}
        className="glass glass-thick fixed z-50 p-4"
        style={{ left: (m.vw - w) / 2, bottom: m.rail.h + 8, width: w, borderRadius: 10 }}
      >
        <div className="mb-3 truncate text-[15px] font-semibold text-strong">When for “{task?.title ?? 'this'}”?</div>
        <div className="grid grid-cols-4 gap-2">
          {days.map((d, i) => (
            <motion.button
              key={iso(d)}
              whileTap={press}
              onClick={() => pick(iso(d))}
              className={`glass-pill h-12 rounded-[8px] text-[14px] ${task?.due_date === iso(d) ? 'font-semibold text-accent' : 'text-strong'}`}
            >
              {label(d, i)}
            </motion.button>
          ))}
        </div>
        <label className="mt-3 flex h-12 items-center justify-between gap-3 rounded-[8px] px-1 text-[14px] text-muted">
          Another day
          <span className="flex items-center gap-2">
            {/* Typing a date fires change on every digit ("0002-10-15"): only a full,
                sensible date counts, set on Enter, on leaving the field, or with Set. */}
            <input
              type="date"
              min={iso(now)}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onBlur={() => pickIfValid(other)}
              onKeyDown={(e) => e.key === 'Enter' && pickIfValid(other)}
              className="glass-pill h-11 rounded-[8px] px-3 text-strong"
            />
            <button
              onClick={() => pickIfValid(other)}
              disabled={!validDay(other, iso(now))}
              className="glass-pill h-11 rounded-[8px] px-3 text-[14px] font-semibold text-accent disabled:opacity-40"
            >
              Set
            </button>
          </span>
        </label>
      </motion.div>
    </>
  )
}
