import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { canShare, removeGift, saveGift, shareGift } from '../../gifts/gifts'
import { useAgent } from '../../stores/agent'
import { gifts, useGifts } from '../../stores/gifts'
import { useMetrics } from '../../stores/metrics'
import { toast } from '../../stores/toast'
import { dayLabel } from '../format'
import { morph, press } from '../motion'
import { GiftImage } from './GiftImage'

/** One gift, large: her picture whole, her note, and keep, share or remove it. */
export function GiftViewer() {
  const id = useGifts((s) => s.open)
  const gift = useGifts((s) => (s.open ? s.items[s.open] : undefined))
  return <AnimatePresence>{id && gift && <Sheet key={id} id={id} />}</AnimatePresence>
}

function Sheet({ id }: { id: string }) {
  const m = useMetrics()
  const gift = useGifts((s) => s.items[id])
  const name = useAgent((s) => s.botName)
  const [busy, setBusy] = useState<'save' | 'share' | null>(null)
  const close = () => gifts.show(null)

  // Escape closes this before anything under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      gifts.show(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!gift) return null
  const w = Math.min(m.vw - 24, 560)
  // The picture takes what's left once the note and the buttons have their room.
  const imgMax = Math.max(160, m.vh - 260)
  const persona = gift.persona && gift.persona.toLowerCase() !== name.toLowerCase() ? gift.persona : name

  const save = async () => {
    setBusy('save')
    const ok = await saveGift(gift)
    setBusy(null)
    if (!ok) toast.error("Couldn't save it. Try again.")
  }
  const share = async () => {
    setBusy('share')
    const r = await shareGift(gift, persona)
    setBusy(null)
    if (r === 'failed') toast.error("Couldn't share it.")
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`A gift from ${persona}`}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={morph}
        className="glass glass-thick fixed z-50 flex flex-col gap-3 p-3"
        style={{ left: (m.vw - w) / 2, top: '50%', translate: '0 -50%', width: w, borderRadius: 14, maxHeight: m.vh - 24 }}
      >
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold tracking-wide text-accent">A gift from {persona}</div>
            <div className="text-[12px] text-muted">{dayLabel(gift.createdAt)}</div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="hit grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:text-strong"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="grid min-h-0 place-items-center overflow-hidden rounded-[10px] bg-text/6">
          <GiftImage gift={gift} fit="contain" eager className="block w-full" style={{ maxHeight: imgMax }} />
        </div>
        {gift.note && (
          <p className="selectable max-h-28 overflow-y-auto px-1 text-[16px] leading-snug text-strong [overflow-wrap:anywhere]">
            {gift.note}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Pill onClick={save} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </Pill>
          {canShare() && (
            <Pill onClick={share} disabled={busy !== null}>
              {busy === 'share' ? 'Sharing…' : 'Share'}
            </Pill>
          )}
          <Pill onClick={() => removeGift(id)} quiet>
            Remove
          </Pill>
        </div>
      </motion.div>
    </>
  )
}

function Pill({
  children,
  onClick,
  disabled,
  quiet,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  quiet?: boolean
}) {
  return (
    <motion.button
      whileTap={press}
      onClick={onClick}
      disabled={disabled}
      className={`glass-pill h-11 min-w-[88px] flex-1 rounded-[8px] px-4 text-[15px] font-semibold disabled:opacity-60 ${quiet ? 'text-muted' : 'text-strong'}`}
    >
      {children}
    </motion.button>
  )
}
