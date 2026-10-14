import { useEffect, useState } from 'react'
import { nameOf } from '../../stores/social'

/** A round initial for someone (names come from other users: always text, never markup). */
export function Avatar({ who, size = 40 }: { who: { displayName: string | null; handle: string | null } | null; size?: number }) {
  const name = nameOf(who).replace(/^@/, '')
  const letter = [...name][0]?.toUpperCase() ?? '?'
  // A steady hue per person, so the same friend always looks the same.
  let h = 0
  for (const c of who?.handle ?? name) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-strong"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `color-mix(in srgb, hsl(${h} 70% 60%) 32%, transparent)`,
      }}
    >
      {letter}
    </span>
  )
}

/** A QR code drawn as one SVG path (the encoder loads only when a code is shown). */
export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const [path, setPath] = useState<{ d: string; n: number } | null>(null)
  useEffect(() => {
    let live = true
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M')
      qr.addData(text)
      qr.make()
      const n = qr.getModuleCount()
      let d = ''
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
      if (live) setPath({ d, n })
    })
    return () => {
      live = false
    }
  }, [text])
  if (!path) return <div className="shimmer rounded-[8px] bg-text/6" style={{ width: size, height: size }} />
  const pad = 2
  return (
    <svg
      role="img"
      aria-label="QR code for your invite link"
      viewBox={`${-pad} ${-pad} ${path.n + pad * 2} ${path.n + pad * 2}`}
      width={size}
      height={size}
      className="rounded-[8px] bg-white"
      shapeRendering="crispEdges"
    >
      <path d={path.d} fill="#000" />
    </svg>
  )
}

/** A two-tap button: the first tap asks, the second does it; it backs off on its own. */
export function Confirm({
  label,
  ask,
  onConfirm,
  tone = 'urgent',
}: {
  label: string
  ask: string
  onConfirm: () => void
  tone?: 'urgent' | 'muted'
}) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 3500)
    return () => clearTimeout(t)
  }, [asking])
  return (
    <button
      onClick={() => (asking ? (setAsking(false), onConfirm()) : setAsking(true))}
      className={`glass-pill h-9 shrink-0 rounded-[8px] px-3 text-[13px] font-semibold ${
        asking ? (tone === 'urgent' ? 'text-urgent' : 'text-strong') : 'text-muted'
      }`}
    >
      {asking ? ask : label}
    </button>
  )
}
