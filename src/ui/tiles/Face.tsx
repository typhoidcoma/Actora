import type { ReactNode } from 'react'

export type Corner = 0 | 1 | 2 | 3 // tl, tr, bl, br

/** Shared tile face: eyebrow, big readout, live line, motif. Mirrored for right-hand tiles. */
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
      className={`flex h-full w-full flex-col gap-[max(4px,calc(var(--grid)*0.012))] p-[max(14px,calc(var(--grid)*0.04))] ${
        right ? 'items-end text-right' : 'items-start text-left'
      } ${bottom ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        <span
          className="h-1.5 w-1.5 rotate-45 rounded-[1px]"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
        />
        <span className="eyebrow">{label}</span>
      </div>
      <div className={`flex items-baseline gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
        <span className="text-[calc(var(--grid)*0.105)] leading-[0.95] font-medium text-white">{value}</span>
        {unit && <span className="num text-[max(11px,calc(var(--grid)*0.026))] text-muted">{unit}</span>}
      </div>
      {line && (
        <div className="max-w-[88%] truncate text-[max(12.5px,calc(var(--grid)*0.024))] leading-snug text-text/80">
          {line}
        </div>
      )}
      {motif && <div className="mt-[calc(var(--grid)*0.01)]">{motif}</div>}
    </div>
  )
}

/** "Dash run" motif from the house style: one tick per item, lit when done. */
export function DashRun({ total, lit, accent }: { total: number; lit: number; accent: string }) {
  const n = Math.min(14, Math.max(total, 1))
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="h-[calc(var(--grid)*0.018)] w-[3px] rounded-full transition-colors duration-500"
          style={{ background: i < lit ? accent : 'rgb(255 255 255 / 0.14)' }}
        />
      ))}
    </div>
  )
}

export function Bar({ value, accent }: { value: number; accent: string }) {
  return (
    <div className="h-[3px] w-[calc(var(--grid)*0.22)] overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out-expo"
        style={{ width: `${Math.round(value * 100)}%`, background: accent, boxShadow: `0 0 12px ${accent}` }}
      />
    </div>
  )
}
