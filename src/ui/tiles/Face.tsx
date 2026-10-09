import type { ReactNode } from 'react'

export type Corner = 0 | 1 | 2 | 3 // tl, tr, bl, br

/** Shared tile face: label, big display readout, live line, motif. Mirrored for right-hand tiles. */
export function Face({
  corner,
  accent,
  label,
  value,
  unit,
  line,
  motif,
}: {
  corner: Corner
  accent: string
  label: string
  value: ReactNode
  unit?: string
  line?: ReactNode
  motif?: ReactNode
}) {
  const right = corner === 1 || corner === 3
  const bottom = corner === 2 || corner === 3
  return (
    <div
      className={`flex h-full w-full flex-col gap-[max(4px,calc(var(--grid)*0.01))] p-[max(14px,calc(var(--grid)*0.04))] ${
        right ? 'items-end text-right' : 'items-start text-left'
      } ${bottom ? 'justify-end' : 'justify-start'}`}
    >
      <span className="label" style={{ color: accent }}>
        {label}
      </span>
      <div className={`flex items-baseline gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="display text-[calc(var(--grid)*0.125)] leading-[0.9] text-strong">{value}</span>
        {unit && <span className="text-[max(12px,calc(var(--grid)*0.026))] text-muted">{unit}</span>}
      </div>
      {line && (
        <div className="max-w-[88%] truncate text-[max(13px,calc(var(--grid)*0.025))] leading-snug text-text">
          {line}
        </div>
      )}
      {motif && <div className="mt-[calc(var(--grid)*0.01)]">{motif}</div>}
    </div>
  )
}

/** One soft dot per item due today, filled when done. */
export function DashRun({ total, lit, accent }: { total: number; lit: number; accent: string }) {
  const n = Math.min(14, Math.max(total, 1))
  return (
    <div className="flex gap-1">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="h-[7px] w-[7px] rounded-full transition-colors duration-500"
          style={{
            background: i < lit ? accent : 'transparent',
            boxShadow: `inset 0 0 0 1.5px ${i < lit ? accent : 'var(--t-line)'}`,
          }}
        />
      ))}
    </div>
  )
}

export function Bar({ value, accent }: { value: number; accent: string }) {
  return (
    <div className="h-1 w-[calc(var(--grid)*0.22)] overflow-hidden rounded-full bg-text/10">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out-expo"
        style={{ width: `${Math.round(value * 100)}%`, background: accent }}
      />
    </div>
  )
}
