import { motion } from 'motion/react'

/** An on/off row: a label, a hint, and a sliding switch. */
export function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-strong">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-fill' : 'bg-text/15'}`}
      >
        <motion.span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          animate={{ left: on ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      </span>
    </button>
  )
}
