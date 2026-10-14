import { useEffect, useState } from 'react'
import { nameOf } from '../../stores/social'
import { pictureUrl } from '../../social/pictures'

/** The tile's corners: a rounded square at every size. */
const corner = (size: number) => Math.round(size * 0.28)

/** A picture tile; onBroken says it couldn't load, so the caller can show its fallback. */
function Picture({ src, size, onBroken }: { src: string; size: number; onBroken: () => void }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={onBroken}
      className="shrink-0 bg-text/10 object-cover"
      style={{ width: size, height: size, borderRadius: corner(size) }}
    />
  )
}

/**
 * Someone's picture, small and rounded square, or their initial on a steady
 * colour (names come from other users: always text, never markup).
 */
export function Avatar({
  who,
  size = 40,
}: {
  who: { displayName: string | null; handle: string | null; avatarPath?: string | null } | null
  size?: number
}) {
  const src = pictureUrl(who?.avatarPath)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  const name = nameOf(who).replace(/^@/, '')
  const letter = [...name][0]?.toUpperCase() ?? '?'
  // A steady hue per person, so the same friend always looks the same.
  let h = 0
  for (const c of who?.handle ?? name) h = (h * 31 + c.charCodeAt(0)) % 360
  if (src && !broken) return <Picture src={src} size={size} onBroken={() => setBroken(true)} />
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center font-semibold text-strong"
      style={{
        width: size,
        height: size,
        borderRadius: corner(size),
        fontSize: size * 0.42,
        background: `color-mix(in srgb, hsl(${h} 70% 60%) 32%, transparent)`,
      }}
    >
      {letter}
    </span>
  )
}

/**
 * A receptionist (someone's assistant): the picture its owner chose, or a
 * default that can't be mistaken for a person: an orb-like glow in the agent
 * colour with a small "AI".
 */
export function AssistantAvatar({ path, size = 40 }: { path?: string | null; size?: number }) {
  const src = pictureUrl(path)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (src && !broken) return <Picture src={src} size={size} onBroken={() => setBroken(true)} />
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center overflow-hidden font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: corner(size),
        fontSize: Math.max(9, size * 0.3),
        color: 'var(--ink-agent)',
        background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--role-agent) 70%, white) 0%, color-mix(in srgb, var(--role-agent) 45%, transparent) 55%, color-mix(in srgb, var(--role-agent) 18%, transparent) 100%)`,
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink-agent) 35%, transparent)',
      }}
    >
      AI
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
